const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');

const client = createClient({ url: process.env.REDIS_URL });

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA PARA: ${cedula} ---`);
        
        // Esta es la ruta que tu log de pago confirmó que funciona
        const rutaReal = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';
        
        console.log(`🚀 Forzando inicio desde: ${rutaReal}`);

        browser = await puppeteer.launch({
            executablePath: rutaReal, // Usamos la ruta física directamente
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        console.log("✅ ¡Navegador abierto correctamente!");
        
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        console.log("📍 Página de la policía cargada.");
        
        // Guardamos un estado temporal en Redis
        await client.set(`resultado:${cedula}`, "PROCESANDO_CAPTCHA", { EX: 300 });

    } catch (e) {
        console.error(`❌ ERROR REAL: ${e.message}`);
    } finally {
        if (browser) {
            await browser.close();
            console.log("🔒 Navegador cerrado.");
        }
    }
}

async function iniciar() {
    try {
        await client.connect();
        console.log("🚀 WORKER CONECTADO A REDIS Y LISTO");
        
        while (true) {
            const t = await client.brPop('cola_consultas', 0);
            if (t) {
                const data = JSON.parse(t.element);
                await ejecutarScraping(data.cedula || data);
            }
        }
    } catch (err) {
        console.error("❌ Error en el bucle principal:", err);
    }
}

const app = express();
app.get('/health', (req, res) => res.send('OK'));
app.listen(process.env.PORT || 10000, () => iniciar());
