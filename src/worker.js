const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const path = require('path');

// CONFIGURACIÓ DE RUTES SEGONS LA DOCUMENTACIÓ DE PPTR.DEV
// Això corregeix l'error de "puppetee" forçant la ruta real de Render
const CHROME_PATH = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANT CONSULTA: ${cedula} ---`);
        console.log(`🚀 Intentant obrir Chrome a: ${CHROME_PATH}`);

        browser = await puppeteer.launch({
            // Utilitzem executablePath directament com diu la guia de pptr.dev
            executablePath: CHROME_PATH,
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        console.log("✅ Navegador obert amb èxit!");
        
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // ... la teva lògica de scraping aquí ...

    } catch (e) {
        console.error(`❌ ERROR CRÍTIC:`, e.message);
    } finally {
        if (browser) await browser.close();
        console.log("--- 🏁 FI DE LA TASCA ---");
    }
}

// Servidor de salut i connexió Redis (igual que abans)
const client = createClient({ url: process.env.REDIS_URL });
const app = express();
app.get('/', (req, res) => res.send('Worker Live'));

app.listen(process.env.PORT || 10000, async () => {
    await client.connect();
    console.log("🚀 WORKER CONNECTAT I LLEST");
    while (true) {
        const t = await client.brPop('cola_consultas', 0);
        if (t) {
            const data = JSON.parse(t.element);
            await ejecutarScraping(data.cedula || data);
        }
    }
});
