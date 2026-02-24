const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');

// --- ⚙️ CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';
const client = createClient({ url: REDIS_URL });

/**
 * 🧩 RESOLVER CAPTCHA (2Captcha)
 */
async function resolverCaptcha(page) {
    try {
        console.log("🧩 Obteniendo SiteKey...");
        const siteKey = await page.evaluate(() => {
            const el = document.querySelector('.g-recaptcha');
            return el ? el.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) throw new Error("No se encontró SiteKey");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        const requestId = resp.data.request;
        console.log(`⏳ Esperando solución de captcha (ID: ${requestId})...`);

        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) return check.data.request;
            if (check.data.request !== 'CAPCHA_NOT_READY') throw new Error(check.data.request);
        }
    } catch (e) {
        throw new Error("Error en Captcha: " + e.message);
    }
}

/**
 * 🤖 LÓGICA DE SCRAPING
 */
async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 PROCESANDO CÉDULA: ${cedula} ---`);

        browser = await puppeteer.launch({
            // Usa el Chrome instalado por el Buildpack
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log("🔗 Conectando con la Policía...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Interacción con la web
        await page.waitForSelector('#continuarBtn', { visible: true });
        await page.click('#continuarBtn');
        
        await page.waitForSelector('#form\\:cedulaInput', { visible: true });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');

        // Resolver Captcha
        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            document.getElementById('g-recaptcha-response').innerHTML = t;
        }, token);

        console.log("🛰️ Enviando formulario...");
        await page.click('#form\\:consultarBtn');
        
        // Capturar resultado
        await page.waitForSelector('#form\\:panelResultado', { timeout: 30000 });
        const resultado = await page.evaluate(() => document.querySelector('#form\\:panelResultado').innerText);

        console.log("📄 ¡DATOS OBTENIDOS!");
        
        // Guardar en Redis
        await client.set(`resultado:${cedula}`, JSON.stringify({ 
            cedula, 
            resultado, 
            fecha: new Date().toISOString() 
        }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ ERROR EN SCRAPING: ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE TAREA: ${cedula} ---`);
    }
}

/**
 * 🌐 SERVIDOR EXPRESS (Para que Render lo marque como "Live")
 */
const app = express();
app.get('/', (req, res) => res.send('Worker Antecedentes Online 🚀'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor Health Check en puerto ${PORT}`);
    iniciarRedis();
});

/**
 * 📥 ESCUCHA DE TAREAS EN REDIS
 */
async function iniciarRedis() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 CONECTADO A REDIS Y ESPERANDO COLA...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const data = JSON.parse(tarea.element);
                // Acepta tanto un objeto {cedula: '...'} como el string directo
                await ejecutarScraping(data.cedula || data);
            }
        }
    } catch (err) {
        console.error("❌ Fallo en Redis:", err);
        setTimeout(iniciarRedis, 5000);
    }
}
