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
    // Usamos el formato de URL con credenciales inyectadas
    const proxyFullUrl = `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
    
    console.log(`🤖 [Worker] Iniciando proceso para CC: ${cedula}`);
    
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            `--proxy-server=${proxyFullUrl}`
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(`📡 [Worker] Conectando a la Policía Nacional...`);
        
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
        });

        // Simulación de interacción
        await page.evaluate(() => {
            const ck = document.querySelector('input[type="checkbox"]');
            if (ck) ck.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });

        console.log(`✅ [${cedula}] Formulario cargado y aceptado.`);

    } catch (e) {
        console.error(`❌ [${cedula}] Error en navegación:`, e.message);
    } finally {
        await browser.close();
        console.log(`🔒 [${cedula}] Navegador cerrado.`);
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🤖 Worker listo. Escuchando Redis...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarConsulta(cedula);
            }
        }
    } catch (err) {
        console.error("Error en el loop del Worker:", err);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
