const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

puppeteer.use(StealthPlugin());

const app = express();
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(process.env.PORT || 10000);

const client = redis.createClient({ url: process.env.REDIS_URL });

async function ejecutarConsulta(cedula) {
    const proxyHost = `${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

    const browser = await puppeteer.launch({
        // Ruta de Chrome en Docker
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--proxy-server=${proxyHost}`
        ]
    });

    const page = await browser.newPage();

    try {
        // AUTENTICACIÓN CORRECTA PARA DOCKER
        await page.authenticate({
            username: process.env.PROXY_USER,
            password: process.env.PROXY_PASS
        });

        console.log(`\n🤖 [Worker] Navegando para CC: ${cedula}`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        await page.evaluate(() => {
            const ck = document.querySelector('input[type="checkbox"]');
            if (ck) ck.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });

        console.log(`✅ [${cedula}] Formulario cargado.`);
        // Aquí sigues con tu lógica...

    } catch (e) {
        console.error(`❌ [${cedula}] Error:`, e.message);
    } finally {
        await browser.close();
    }
}

async function iniciar() {
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

iniciar();
