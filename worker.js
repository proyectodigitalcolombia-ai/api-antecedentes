const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const { Solver } = require('2captcha');

puppeteer.use(StealthPlugin());

// Servidor de salud obligatorio para Render
const app = express();
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(process.env.PORT || 10000);

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function misionPolicia(cedula) {
    const proxyUrl = `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--proxy-server=${proxyUrl}`
        ]
    });

    const page = await browser.newPage();

    try {
        console.log(`\n🔎 [${cedula}] Conectando a Policía Nacional...`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Aceptar términos
        await page.evaluate(() => {
            const ck = document.querySelector('input[type="checkbox"]');
            if (ck) ck.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });

        console.log(`✅ [${cedula}] Túnel establecido. Entrando a formulario...`);
        
        // Aquí puedes seguir con la lógica del captcha que ya tienes...
        // ...

        return true;
    } catch (e) {
        console.error(`❌ [${cedula}] Error:`, e.message);
        return false;
    } finally {
        await browser.close();
    }
}

async function iniciar() {
    try {
        await client.connect();
        console.log("🤖 Master Worker iniciado y escuchando Redis...");

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await misionPolicia(cedula);
            }
        }
    } catch (err) {
        console.error("Error en el loop del Worker:", err);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
