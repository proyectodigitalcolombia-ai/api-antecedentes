const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

puppeteer.use(StealthPlugin());

// Servidor de salud para Render (Evita que el servicio se caiga)
const app = express();
app.get('/health', (req, res) => res.status(200).send('OK'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health check en puerto ${PORT}`));

const client = redis.createClient({ url: process.env.REDIS_URL });

async function ejecutarConsulta(cedula) {
    const proxyUrl = `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
    
    console.log(`🤖 [Worker] Preparando navegador para: ${cedula}`);
    
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            `--proxy-server=${proxyUrl}`
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(`📡 [Worker] Conectando a Policía...`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
        });

        console.log(`✅ [${cedula}] Página cargada.`);
    } catch (e) {
        console.error(`❌ [${cedula}] Error:`, e.message);
    } finally {
        await browser.close();
    }
}

async function loop() {
    try {
        await client.connect();
        console.log("🤖 Worker conectado a Redis y esperando...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarConsulta(cedula);
            }
        }
    } catch (err) {
        console.error("💥 Error crítico en el loop:", err);
        process.exit(1); // Esto hará que Render lo reinicie automáticamente
    }
}

loop();
