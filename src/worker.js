const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

// --- CONFIGURACIÓN GLOBAL BLINDADA ---
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';

// RUTA EXACTA VALIDADA EN TU LOG DE RENDER
const CHROME_PATH = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';

const client = createClient({ url: REDIS_URL });

/**
 * Resolver reCAPTCHA v2
 */
async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando SiteKey del captcha...");
        const siteKey = await page.evaluate(() => {
            const element = document.querySelector('.g-recaptcha');
            return element ? element.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) throw new Error("No se encontró la SiteKey.");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        if (resp.data.status !== 1) throw new Error("2Captcha rechazó envío: " + resp.data.request);
        
        const requestId = resp.data.request;
        console.log(`⏳ Captcha enviado (ID: ${requestId}). Esperando solución...`);

        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            
            if (check.data.status === 1) {
                console.log("✅ Captcha resuelto.");
                return check.data.request;
            }
            if (check.data.request !== 'CAPCHA_NOT_READY') {
                throw new Error("Fallo en 2Captcha: " + check.data.request);
            }
            console.log("... esperando resolución ...");
        }
    } catch (error) {
        throw new Error("Fallo en Captcha: " + error.message);
    }
}

/**
 * Lógica Principal de Scraping
 */
async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO NUEVA CONSULTA: ${cedula} ---`);
        
        // Verificación física del archivo antes de arrancar
        if (!fs.existsSync(CHROME_PATH)) {
            console.error(`🚨 ERROR CRÍTICO: Chrome no existe en ${CHROME_PATH}`);
            throw new Error("Ejecutable de Chrome no encontrado.");
        }

        console.log(`🚀 Forzando inicio desde ruta física: ${CHROME_PATH}`);

        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            userDataDir: '/tmp/session_' + cedula, // Carpeta de sesión única y limpia
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
                '--no-zygote'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log("🔗 Navegando a la Policía...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 1. Aceptar términos
        await page.waitForSelector('#continuarBtn', { timeout: 20000 });
        await page.click('#continuarBtn');
        console.log("✅ Términos aceptados.");

        // 2. Ingresar Cédula
        await page.waitForSelector('#form\\:cedulaInput', { timeout: 20000 });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');

        // 3. Captcha
        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            document.getElementById('g-recaptcha-response').innerHTML = t;
        }, token);

        // 4. Consultar
        await page.click('#form\\:consultarBtn');
        console.log("🖱️ Consultando...");

        // 5. Capturar Resultado
        await page.waitForSelector('#form\\:panelResultado', { timeout: 30000 });
        const textoResultado = await page.evaluate(() => {
            return document.querySelector('#form\\:panelResultado').innerText;
        });

        console.log("📄 Información extraída.");
        await client.set(`resultado:${cedula}`, JSON.stringify({ 
            cedula, 
            resultado: textoResultado,
            timestamp: new Date().toISOString()
        }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ ERROR: ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE LA TAREA: ${cedula} ---`);
    }
}

// --- SERVIDOR Y ESCUCHA ---
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
        console.error("Error en arranque:", err);
    }
});
