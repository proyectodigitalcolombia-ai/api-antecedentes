const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const app = express();
app.use('/capturas', express.static('capturas')); // Para que puedas ver las fotos
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(process.env.PORT || 10000);

const client = redis.createClient({ url: process.env.REDIS_URL });
client.on('error', () => {}); // Silenciar spam

async function ejecutarConsulta(cedula) {
    console.log(`\n🔎 [${cedula}] Iniciando prueba SIN PROXY para descartar bloqueos...`);
    
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // Navegamos directamente
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Tomamos una captura para estar seguros
        if (!fs.existsSync('./capturas')) fs.mkdirSync('./capturas');
        await page.screenshot({ path: `./capturas/${cedula}.png` });

        console.log(`✅ [${cedula}] ¡ÉXITO TOTAL! Página cargada y captura guardada.`);
        console.log(`📸 Mira la imagen en: https://api-antecedentes.onrender.com/capturas/${cedula}.png`);

    } catch (e) {
        console.error(`❌ [${cedula}] Error incluso sin proxy: ${e.message}`);
    } finally {
        await browser.close();
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🤖 Worker listo. Esperando cédula...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarConsulta(cedula);
            }
        }
    } catch (err) {
        setTimeout(iniciar, 5000);
    }
}

iniciar();
