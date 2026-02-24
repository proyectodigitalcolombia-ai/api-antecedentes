const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

puppeteer.use(StealthPlugin());

// Servidor de salud para Render
const app = express();
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(process.env.PORT || 10000);

const client = redis.createClient({ url: process.env.REDIS_URL });

async function ejecutarConsulta(cedula) {
    const proxyHost = `${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--ignore-certificate-errors',
            `--proxy-server=${proxyHost}`
        ]
    });

    const page = await browser.newPage();

    try {
        // Autenticación de Proxy
        await page.authenticate({
            username: process.env.PROXY_USER,
            password: process.env.PROXY_PASS
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

        console.log(`\n🤖 [Worker] Navegando para CC: ${cedula}`);
        
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Aceptar términos
        await page.evaluate(() => {
            const ck = document.querySelector('input[type="checkbox"]');
            if (ck) ck.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });

        console.log(`✅ [${cedula}] Formulario cargado con éxito.`);

    } catch (e) {
        console.error(`❌ [${cedula}] Error:`, e.message);
    } finally {
        await browser.close();
        console.log(`🔒 [${cedula}] Navegador cerrado.`);
    }
}

async function iniciar() {
    try {
        await client.connect();
        console.log("🤖 Worker conectado a Redis y esperando tareas...");

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarConsulta(cedula);
            }
        }
    } catch (err) {
        console.error("Error en loop:", err);
        setTimeout(iniciar, 5000);
    }
}

iniciar(); // <--- IMPORTANTE: Ejecutar la función
