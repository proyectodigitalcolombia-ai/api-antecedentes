const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

// --- CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';

// Esta es la ruta real donde Render instala Chrome tras el build command
const CHROME_PATH = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';

const client = createClient({ url: REDIS_URL });

/**
 * Resolver reCAPTCHA v2 usando 2Captcha
 */
async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando SiteKey del captcha...");
        const siteKey = await page.evaluate(() => {
            const element = document.querySelector('.g-recaptcha');
            return element ? element.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) throw new Error("No se pudo extraer la SiteKey");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        if (resp.data.status !== 1) throw new Error("2Captcha error: " + resp.data.request);
        
        const requestId = resp.data.request;
        console.log(`⏳ Captcha enviado (ID: ${requestId}). Esperando solución...`);

        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            
            if (check.data.status === 1) {
                console.log("✅ Captcha resuelto por el servicio.");
                return check.data.request;
            }
            if (check.data.request !== 'CAPCHA_NOT_READY') {
                throw new Error("Fallo en 2Captcha: " + check.data.request);
            }
            console.log("... el experto sigue resolviendo ...");
        }
    } catch (error) {
        throw new Error("Fallo en resolución de Captcha: " + error.message);
    }
}

/**
 * Lógica principal de Scraping
 */
async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA: ${cedula} ---`);
        
        // Verificación de seguridad: ¿Existe el archivo?
        if (!fs.existsSync(CHROME_PATH)) {
            console.log(`⚠️ Advertencia: No veo Chrome en ${CHROME_PATH}. Buscando rutas alternativas...`);
        }

        browser = await puppeteer.launch({
            executablePath: CHROME_PATH, 
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        console.log("✅ Navegador abierto con éxito.");
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log("🔗 Navegando a la web de la Policía...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 1. Aceptar términos
        await page.waitForSelector('#continuarBtn', { timeout: 15000 });
        await page.click('#continuarBtn');
        console.log("✅ Términos aceptados.");

        // 2. Llenar formulario
        await page.waitForSelector('#form\\:cedulaInput', { timeout: 15000 });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');
        console.log("✍️ Cédula ingresada.");

        // 3. Resolver Captcha
        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            document.getElementById('g-recaptcha-response').innerHTML = t;
        }, token);

        // 4. Consultar
        await page.click('#form\\:consultarBtn');
        console.log("🖱️ Clic en consultar.");

        // 5. Extraer Resultado
        await page.waitForSelector('#form\\:panelResultado', { timeout: 30000 });
        const textoResultado = await page.evaluate(() => {
            return document.querySelector('#form\\:panelResultado').innerText;
        });

        console.log("📄 Información extraída correctamente.");
        await client.set(`resultado:${cedula}`, JSON.stringify({ 
            cedula, 
            resultado: textoResultado,
            timestamp: new Date().toISOString()
        }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ ERROR EN EL PROCESO: ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE LA TAREA: ${cedula} ---`);
    }
}

// SERVIDOR Y ESCUCHA DE REDIS
const app = express();
app.get('/', (req, res) => res.send('Worker Bot Activo 🤖'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', async () => {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 WORKER CONECTADO A REDIS. ESCUCHANDO COLA...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const data = JSON.parse(tarea.element);
                const numCedula = data.cedula || data;
                await ejecutarScraping(numCedula);
            }
        }
    } catch (err) {
        console.error("Fallo crítico en el arranque:", err);
    }
});
