const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');

const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';
const client = createClient({ url: REDIS_URL });

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA: ${cedula} ---`);

        browser = await puppeteer.launch({
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

        console.log("🔗 Navegando al portal...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // (Aquí sigue tu lógica de botones y captcha que ya conocemos)
        console.log("✅ Navegación iniciada con éxito.");

    } catch (e) {
        console.error(`❌ ERROR: ${e.message}`);
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE TAREA ---`);
    }
}

const app = express();
app.get('/', (req, res) => res.send('Worker Online 🤖'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor Express en puerto ${PORT}`);
    iniciarRedis();
});

async function iniciarRedis() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 REDIS OK. ESPERANDO TAREAS...");
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const data = JSON.parse(tarea.element);
                await ejecutarScraping(data.cedula || data);
            }
        }
    } catch (err) {
        console.error("Error Redis:", err);
        setTimeout(iniciarRedis, 5000);
    }
}
