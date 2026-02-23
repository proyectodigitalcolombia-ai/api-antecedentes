const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';
const client = createClient({ url: REDIS_URL });

async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando SiteKey...");
        const siteKey = await page.evaluate(() => {
            const el = document.querySelector('.g-recaptcha');
            return el ? el.getAttribute('data-sitekey') : null;
        });
        if (!siteKey) throw new Error("No se encontró SiteKey");
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${page.url()}&json=1`);
        const requestId = resp.data.request;
        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) return check.data.request;
            if (check.data.request !== 'CAPCHA_NOT_READY') throw new Error(check.data.request);
        }
    } catch (e) { throw new Error("Captcha: " + e.message); }
}

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 CONSULTA: ${cedula} ---`);
        
        // RUTAS POSIBLES EN RENDER
        const posiblesRutas = [
            '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome',
            '/opt/render/project/src/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome',
            process.env.PUPPETEER_EXECUTABLE_PATH
        ];

        let rutaFinal = posiblesRutas.find(ruta => ruta && fs.existsSync(ruta));

        if (!rutaFinal) {
            console.log("⚠️ No se halló Chrome en rutas físicas. Intentando inicio automático...");
        } else {
            console.log(`🚀 Iniciando Chrome desde: ${rutaFinal}`);
        }

        browser = await puppeteer.launch({
            executablePath: rutaFinal || undefined,
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { waitUntil: 'networkidle2' });
        
        await page.waitForSelector('#continuarBtn');
        await page.click('#continuarBtn');
        
        await page.waitForSelector('#form\\:cedulaInput');
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');

        const token = await resolverCaptcha(page);
        await page.evaluate(t => { document.getElementById('g-recaptcha-response').innerHTML = t; }, token);

        await page.click('#form\\:consultarBtn');
        await page.waitForSelector('#form\\:panelResultado', { timeout: 30000 });
        
        const resultado = await page.evaluate(() => document.querySelector('#form\\:panelResultado').innerText);
        await client.set(`resultado:${cedula}`, JSON.stringify({ cedula, resultado }), { EX: 3600 });
        console.log("✅ Consulta completada con éxito.");

    } catch (e) {
        console.error(`❌ ERROR: ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN TAREA ---`);
    }
}

const app = express();
app.get('/', (req, res) => res.send('Worker OK'));
app.listen(process.env.PORT || 10000, async () => {
    await client.connect();
    console.log("🚀 ESCUCHANDO COLA EN REDIS...");
    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            const data = JSON.parse(tarea.element);
            await ejecutarScraping(data.cedula || data);
        }
    }
});
