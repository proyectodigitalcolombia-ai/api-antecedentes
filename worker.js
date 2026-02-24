const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

puppeteer.use(StealthPlugin());

// Servidor de salud para que Render no mate el proceso
const app = express();
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(process.env.PORT || 10000);

const client = redis.createClient({ url: process.env.REDIS_URL });

async function ejecutarConsulta(cedula) {
    const proxyUrl = `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: ['--no-sandbox', `--proxy-server=${proxyUrl}`]
    });

    const page = await browser.newPage();

    try {
        console.log(`\n🤖 [Worker] Procesando CC: ${cedula}`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', timeout: 60000 
        });

        // Aceptar términos
        await page.evaluate(() => {
            const ck = document.querySelector('input[type="checkbox"]');
            if (ck) ck.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });

        console.log(`✅ [${cedula}] Formulario cargado exitosamente.`);
        // Aquí continúa tu lógica de captcha y scraping...

    } catch (e) {
        console.error(`❌ Error en consulta ${cedula}:`, e.message);
    } finally {
        await browser.close();
    }
}

async function loop() {
    await client.connect();
    console.log("🤖 Worker conectado a Redis y esperando tareas...");
    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            const { cedula } = JSON.parse(tarea.element);
            await ejecutarConsulta(cedula);
        }
    }
}

loop();
