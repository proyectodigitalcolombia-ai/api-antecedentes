const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const { Solver } = require('2captcha');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor activo en puerto ${PORT}`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function misionPolicia(cedula) {
    const proxyUrl = `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

    const browser = await puppeteer.launch({
        // ESTA LÍNEA ES LA QUE HACE QUE SEA RÁPIDO:
        executablePath: '/usr/bin/google-chrome', 
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors',
            `--proxy-server=${proxyUrl}`
        ]
    });

    const page = await browser.newPage();

    try {
        console.log(`🇨🇴 Conectando a Policía Nacional...`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Lógica de aceptación
        await page.evaluate(() => {
            const ck = document.querySelector('input[type="checkbox"]');
            if (ck) ck.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });

        console.log("🧩 Túnel abierto y términos aceptados.");
        
        // Aquí seguiría la resolución del captcha...
        return { nombre: "IDENTIFICANDO...", estado: "PROCESANDO" };

    } catch (e) {
        console.error("❌ Error de conexión:", e.message);
        return null;
    } finally {
        await browser.close();
    }
}

async function iniciar() {
    await client.connect();
    console.log("🤖 Master Worker listo.");
    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            const { cedula } = JSON.parse(tarea.element);
            await misionPolicia(cedula);
        }
    }
}

iniciar();
