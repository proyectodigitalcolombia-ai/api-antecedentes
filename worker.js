const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

puppeteer.use(StealthPlugin());

const app = express();
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(process.env.PORT || 10000);

const client = redis.createClient({ 
    url: process.env.REDIS_URL,
    socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 2000) }
});

client.on('error', (err) => console.log('Redis Client Error', err));

async function ejecutarConsulta(cedula) {
    const proxyUrl = `${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
    let browser;
    
    try {
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/google-chrome',
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', `--proxy-server=http://${proxyUrl}`]
        });

        const page = await browser.newPage();
        await page.authenticate({ username: process.env.PROXY_USER, password: process.env.PROXY_PASS });
        
        console.log(`📡 [${cedula}] Navegando...`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
        });

        console.log(`✅ [${cedula}] ¡Éxito!`);
    } catch (e) {
        console.error(`❌ [${cedula}] Error:`, e.message);
    } finally {
        if (browser) await browser.close();
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) {
            await client.connect();
            console.log("🤖 Worker conectado a Redis.");
        }

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarConsulta(cedula);
            }
        }
    } catch (err) {
        console.error("💥 Error en loop:", err.message);
        // Si el socket ya está abierto, no intentamos conectar de nuevo, solo esperamos
        setTimeout(iniciar, 5000);
    }
}

iniciar();
