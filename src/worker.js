const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

// --- CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';
const CHROME_PATH = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';

const client = createClient({ url: REDIS_URL });

/**
 * Resuelve el reCAPTCHA v2 inyectando el token en la página
 */
async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando SiteKey del captcha...");
        const siteKey = await page.evaluate(() => {
            const element = document.querySelector('.g-recaptcha');
            return element ? element.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) throw new Error("No se encontró la SiteKey en la página.");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        
        // 1. Enviar a 2Captcha
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        if (resp.data.status !== 1) throw new Error("2Captcha rechazó la solicitud: " + resp.data.request);
        
        const requestId = resp.data.request;
        console.log(`⏳ Captcha enviado (ID: ${requestId}). Esperando resolución...`);

        // 2. Poll (esperar respuesta)
        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            
            if (check.data.status === 1) {
                console.log("✅ Captcha resuelto por el servicio.");
                return check.data.request; // Este es el token
            }
            if (check.data.request !== 'CAPCHA_NOT_READY') {
                throw new Error("Error en 2Captcha: " + check.data.request);
            }
            console.log("... el experto sigue resolviendo ...");
        }
    } catch (error) {
        throw new Error("Fallo en resolución de Captcha: " + error.message);
    }
}

/**
 * Lógica principal de navegación y extracción
 */
async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO NUEVA CONSULTA: ${cedula} ---`);
        console.log(`🚀 Intentando abrir Chrome en: ${CHROME_PATH}`);

        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            userDataDir: '/tmp/puppeteer_user_data',
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
        console.log("⚖️ Aceptando términos...");
        await page.waitForSelector('#continuarBtn', { timeout: 20000 });
        await page.click('#continuarBtn');
        
        // 2. Formulario
        console.log("✍️ Ingresando datos...");
        await page.waitForSelector('#form\\:cedulaInput', { timeout: 20000 });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');

        // 3. Resolver Captcha
        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            document.getElementById('g-recaptcha-response').innerHTML = t;
        }, token);
        console.log("✅ Token de Captcha inyectado.");

        // 4. Consultar
        await page.click('#form\\:consultarBtn');
        console.log("🖱️ Consultando...");

        // 5. Resultado
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
        console.error(`❌ ERROR CRÍTICO: ${e.message}`);
        if (e.message.includes('Could not find Chrome')) {
            if (fs.existsSync(CHROME_PATH)) {
                console.log("📂 El ejecutable EXISTE pero Puppeteer no lo reconoce.");
            }
        }
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE LA TAREA: ${cedula} ---`);
    }
}

// --- ARRANQUE DEL SERVIDOR Y ESCUCHA ---
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
        console.error("Fallo crítico:", err);
    }
});
