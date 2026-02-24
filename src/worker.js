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

        if (!siteKey) throw new Error("No se encontró SiteKey en la página");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        const requestId = resp.data.request;
        console.log(`⏳ Resolviendo Captcha (ID: ${requestId})...`);

        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) return check.data.request;
            if (check.data.request !== 'CAPCHA_NOT_READY') throw new Error(check.data.request);
        }
    } catch (e) {
        throw new Error("Error en resolución de Captcha: " + e.message);
    }
}

/**
 * 🤖 LÓGICA DE SCRAPING
 */
async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA: ${cedula} ---`);

        browser = await puppeteer.launch({
            // RUTA FIJA PARA DOCKER
            executablePath: '/usr/bin/google-chrome',
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        // User agent real para evitar bloqueos
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log("🔗 Navegando al portal de la Policía...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 1. Aceptar términos
        await page.waitForSelector('#continuarBtn', { visible: true });
        await page.click('#continuarBtn');
        
        // 2. Llenar formulario
        await page.waitForSelector('#form\\:cedulaInput', { visible: true });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');

        // 3. Resolver Captcha
        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            const el = document.getElementById('g-recaptcha-response');
            if (el) el.innerHTML = t;
        }, token);

        console.log("🛰️ Enviando consulta...");
        await page.click('#form\\:consultarBtn');
        
        // 4. Esperar y extraer resultado
        await page.waitForSelector('#form\\:panelResultado', { timeout: 35000 });
        const resultado = await page.evaluate(() => document.querySelector('#form\\:panelResultado').innerText);

        console.log("📄 ¡ÉXITO! Guardando resultado...");
        
        // Guardar en Redis (Expira en 1 hora)
        await client.set(`resultado:${cedula}`, JSON.stringify({ 
            cedula, 
            resultado, 
            fecha: new Date().toISOString() 
        }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ ERROR: ${e.message}`);
        // Guardar el error para que la API sepa qué pasó
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE TAREA ---`);
    }
}

/**
 * 🌐 SERVIDOR EXPRESS PARA HEALTH CHECK
 */
const app = express();
app.get('/', (req, res) => res.send('Worker Antecedentes [Docker Mode] 🤖🚀'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor Express escuchando en puerto ${PORT}`);
    iniciarProcesamientoRedis();
});

/**
 * 📥 BUCLE DE PROCESAMIENTO REDIS
 */
async function iniciarProcesamientoRedis() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 CONECTADO A REDIS. ESPERANDO TAREAS EN 'cola_consultas'...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const data = JSON.parse(tarea.element);
                // Procesa ya sea que envíes un objeto {cedula: '...'} o solo el número
                await ejecutarScraping(data.cedula || data);
            }
        }
    } catch (err) {
        console.error("❌ Error en conexión Redis:", err);
        setTimeout(iniciarProcesamientoRedis, 5000);
    }
}
