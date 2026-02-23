const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

const client = createClient({ url: process.env.REDIS_URL });
const solver = new Solver(process.env.CAPTCHA_KEY || "TU_KEY_AQUÍ");

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 CONSULTANDO: ${cedula} ---`);
        
        // Aquí NO ponemos rutas. Dejamos que las variables de Render manden.
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
        });

        const page = await browser.newPage();
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { waitUntil: 'networkidle2' });

        // Lógica simplificada de aceptación
        await page.waitForSelector('input[type="checkbox"]');
        await page.click('input[type="checkbox"]');
        await page.click('#continuarPasoSiguiente');

        // Captcha y resultado...
        const siteKey = await page.evaluate(() => document.querySelector('.g-recaptcha')?.getAttribute('data-sitekey'));
        const solve = await solver.recaptcha({ pageurl: page.url(), googlekey: siteKey });
        
        await page.evaluate((token) => { document.querySelector('#g-recaptcha-response').innerHTML = token; }, solve.data);
        await page.type('input[id*="cedulaInput"]', cedula);
        await page.click('button[id*="btnConsultar"]');
        
        await new Promise(r => setTimeout(r, 5000));
        const res = await page.evaluate(() => document.body.innerText.includes('No tiene asuntos pendientes') ? "LIMPIO" : "REVISAR");

        await client.set(`resultado:${cedula}`, res, { EX: 86400 });
        console.log(`✅ OK: ${cedula}`);

    } catch (e) {
        console.error(`❌ ERROR: ${e.message}`);
    } finally {
        if (browser) await browser.close();
    }
}

async function iniciar() {
    await client.connect();
    while (true) {
        const t = await client.brPop('cola_consultas', 0);
        const d = JSON.parse(t.element);
        await ejecutarScraping(d.cedula || d);
    }
}

const app = express();
app.listen(process.env.PORT || 10000, () => iniciar());
