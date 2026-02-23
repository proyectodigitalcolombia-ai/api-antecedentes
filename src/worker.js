const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

// --- CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';

// Esta ruta es la que Render confirmó en el log de instalación
const CHROME_PATH = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';

const client = createClient({ url: REDIS_URL });

/**
 * Función para resolver el captcha usando 2Captcha
 */
async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando SiteKey...");
        const siteKey = await page.evaluate(() => {
            const element = document.querySelector('.g-recaptcha');
            return element ? element.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) throw new Error("No se encontró SiteKey.");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        if (resp.data.status !== 1) throw new Error("2Captcha error: " + resp.data.request);
        
        const requestId = resp.data.request;
        console.log(`⏳ Esperando resolución de captcha (ID: ${requestId})...`);

        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) return check.data.request;
            if (check.data.request !== 'CAPCHA_NOT_READY') throw new Error(check.data.request);
            console.log("... el experto sigue trabajando ...");
        }
    } catch (e) {
        throw new Error("Fallo en Captcha: " + e.message);
    }
}

/**
 * Proceso de Scraping con ruta blindada
 */
async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA: ${cedula} ---`);

        // Verificamos si el archivo existe antes de intentar abrirlo
        if (!fs.existsSync(CHROME_PATH)) {
            console.log("❌ ERROR: El archivo de Chrome no está en la ruta esperada.");
            console.log("Intentando buscar en ruta alternativa...");
        }

        browser = await puppeteer.launch({
            executablePath: CHROME_PATH, // Ignora el archivo de configuración mal escrito
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        console.log("✅ Navegador abierto correctamente.");
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log("🔗 Cargando web de la Policía...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Proceso de navegación
        await page.waitForSelector('#continuarBtn', { timeout: 20000 });
        await page.click('#continuarBtn');
        
        await page.waitForSelector('#form\\:cedulaInput', { timeout: 20000 });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');

        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            document.getElementById('g-recaptcha-response').innerHTML = t;
        }, token);

        await page.click('#form\\:consultarBtn');
        console.log("🖱️ Consultando...");

        await page.waitForSelector('#form\\:panelResultado', { timeout: 30000 });
        const resultado = await page.evaluate(() => document.querySelector('#form\\:panelResultado').innerText);

        console.log("📄 Datos obtenidos con éxito.");
        await client.set(`resultado:${cedula}`, JSON.stringify({ cedula, resultado, timestamp: new Date() }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ ERROR: ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE TAREA: ${cedula} ---`);
    }
}

// --- SERVIDOR Y ESCUCHA DE COLA ---
const app = express();
app.get('/', (req, res) => res.send('Worker Activo 🤖'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', async () => {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 WORKER CONECTADO Y ESCUCHANDO COLA...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const data = JSON.parse(tarea.element);
                await ejecutarScraping(data.cedula || data);
            }
        }
    } catch (err) {
        console.error("Fallo crítico:", err);
    }
});
