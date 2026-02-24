const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- ⚙️ CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';
const client = createClient({ url: REDIS_URL });

function encontrarChrome() {
    // 1. Intentamos buscar en la carpeta .cache que creamos en el build
    const rutaLocal = path.join(__dirname, '../.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome');
    
    // 2. Intentamos la ruta absoluta de Render
    const rutaAbsoluta = '/opt/render/project/src/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';

    if (fs.existsSync(rutaLocal)) {
        console.log(`✅ Chrome encontrado localmente: ${rutaLocal}`);
        return rutaLocal;
    }
    if (fs.existsSync(rutaAbsoluta)) {
        console.log(`✅ Chrome encontrado en ruta absoluta: ${rutaAbsoluta}`);
        return rutaAbsoluta;
    }

    try {
        console.log("⚠️ Buscando ejecutable 'chrome' en todo el proyecto...");
        const hallazgo = execSync("find /opt/render -type f -name chrome | grep 'chrome-linux64/chrome' | head -n 1").toString().trim();
        if (hallazgo) {
            console.log(`🎯 Chrome localizado mediante find: ${hallazgo}`);
            return hallazgo;
        }
    } catch (e) {
        console.log("❌ Error en búsqueda profunda.");
    }
    return null;
}

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
        console.log(`⏳ Resolviendo Captcha (ID: ${requestId})...`);

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

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA: ${cedula} ---`);

        const rutaEjecutable = encontrarChrome();
        if (!rutaEjecutable) throw new Error("No se localizó el ejecutable de Chrome.");

        browser = await puppeteer.launch({
            executablePath: rutaEjecutable,
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log("🔗 Navegando a la Policía Nacional...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        await page.waitForSelector('#continuarBtn', { visible: true });
        await page.click('#continuarBtn');
        
        await page.waitForSelector('#form\\:cedulaInput', { visible: true });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');

        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            const el = document.getElementById('g-recaptcha-response');
            if (el) el.innerHTML = t;
        }, token);

        await page.click('#form\\:consultarBtn');
        console.log("🛰️ Procesando respuesta...");
        
        await page.waitForSelector('#form\\:panelResultado', { timeout: 45000 });
        const resultado = await page.evaluate(() => document.querySelector('#form\\:panelResultado').innerText);

        console.log("📄 ¡ÉXITO! Datos recuperados.");
        await client.set(`resultado:${cedula}`, JSON.stringify({ cedula, resultado, fecha: new Date().toISOString() }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ ERROR: ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE TAREA: ${cedula} ---`);
    }
}

const app = express();
app.get('/', (req, res) => res.send('Worker Activo 🤖'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', async () => {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 WORKER CONECTADO Y ESPERANDO TAREAS.");
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const data = JSON.parse(tarea.element);
                await ejecutarScraping(data.cedula || data);
            }
        }
    } catch (err) {
        console.error("Error en bucle principal:", err);
    }
});
