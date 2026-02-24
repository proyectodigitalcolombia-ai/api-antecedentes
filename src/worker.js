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
            // Ya no definimos executablePath manual, Puppeteer lo sabe por la env var
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
        });

        const page = await browser.newPage();
        console.log("🔗 Navegando al portal...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // ... resto de tu lógica de interacción (botones, captcha, etc.) ...
        // (Usa el mismo código de interacción que ya teníamos)
        
        console.log("📄 Proceso terminado para: " + cedula);

    } catch (e) {
        console.error(`❌ ERROR: ${e.message}`);
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE TAREA ---`);
    }
}

const app = express();
app.get('/', (req, res) => res.send('Worker Live 🤖'));

app.listen(process.env.PORT || 10000, '0.0.0.0', () => {
    console.log("✅ Servidor Express OK");
    iniciarRedis();
});

async function iniciarRedis() {
    if (!client.isOpen) await client.connect();
    console.log("🚀 Esperando tareas en Redis...");
    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) await ejecutarScraping(JSON.parse(tarea.element).cedula);
    }
}
