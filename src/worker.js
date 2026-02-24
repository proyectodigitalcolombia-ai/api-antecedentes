const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';
const client = createClient({ url: REDIS_URL });

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA: ${cedula} ---`);

        // RUTA DINÁMICA: Donde copiamos Chrome en el build
        const rutaChrome = path.join(process.cwd(), '.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome');
        
        console.log(`🔍 Buscando Chrome en: ${rutaChrome}`);

        browser = await puppeteer.launch({
            executablePath: fs.existsSync(rutaChrome) ? rutaChrome : undefined,
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

        // Resolución de Captcha simplificada para el ejemplo
        console.log("🧩 Iniciando resolución de Captcha...");
        // Aquí iría tu lógica de resolverCaptcha(page)...

        // (Resto de tu lógica de extracción aquí...)

        await client.set(`resultado:${cedula}`, JSON.stringify({ status: "Procesado" }), { EX: 3600 });

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
app.listen(process.env.PORT || 10000, '0.0.0.0', async () => {
    if (!client.isOpen) await client.connect();
    console.log("🚀 WORKER CONECTADO Y ESCUCHANDO.");
    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            const data = JSON.parse(tarea.element);
            await ejecutarScraping(data.cedula || data);
        }
    }
});
