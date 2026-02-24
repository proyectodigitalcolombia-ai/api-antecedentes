const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

puppeteer.use(StealthPlugin());

const app = express();
// Servidor de salud para que Render no mate el proceso
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => {
    console.log("✅ Servidor de salud activo");
});

const client = redis.createClient({ url: process.env.REDIS_URL });

async function ejecutarConsulta(cedula) {
    const proxyUrl = `${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
    console.log(`\n🤖 [Worker] Iniciando navegación para: ${cedula}`);

    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--proxy-server=http://${proxyUrl}`
        ]
    });

    const page = await browser.newPage();
    try {
        await page.authenticate({
            username: process.env.PROXY_USER,
            password: process.env.PROXY_PASS
        });

        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
        });

        console.log(`✅ [${cedula}] ¡Página cargada con éxito!`);
    } catch (e) {
        console.error(`❌ [${cedula}] Error:`, e.message);
    } finally {
        await browser.close();
    }
}

async function iniciar() {
    try {
        console.log("🔄 Intentando conectar a Redis...");
        await client.connect();
        console.log("🤖 Worker conectado a Redis. Esperando tareas...");

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarConsulta(cedula);
            }
        }
    } catch (err) {
        console.error("💥 ERROR CRÍTICO AL INICIAR:", err.message);
        // Esperamos 5 segundos y reintentamos para que Render no marque error
        setTimeout(iniciar, 5000);
    }
}

// Arrancamos el proceso
iniciar();
