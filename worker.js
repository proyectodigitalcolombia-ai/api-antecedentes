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
    // Para SOCKS5 en Puppeteer, usamos este formato en los args
    const proxyUrl = `socks5://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors',
            `--proxy-server=${proxyUrl}`
        ]
    });

    const page = await browser.newPage();

    try {
        // Autenticación SOCKS5
        await page.authenticate({
            username: process.env.PROXY_USER,
            password: process.env.PROXY_PASS
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(`\n🤖 [Worker] Túnel SOCKS5 abierto. Navegando a Policía Nacional...`);
        
        // Timeout extendido para el puerto 7005
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 90000 
        });

        await page.evaluate(() => {
            const ck = document.querySelector('input[type="checkbox"]');
            if (ck) ck.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });

        console.log(`✅ [${cedula}] ¡ÉXITO! Entramos a la página.`);

    } catch (e) {
        console.error(`❌ [${cedula}] Error:`, e.message);
    } finally {
        await browser.close();
    }
}

async function iniciar() {
    try {
        await client.connect();
        console.log("🤖 Worker listo con SOCKS5. Esperando tareas...");
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

iniciar();
