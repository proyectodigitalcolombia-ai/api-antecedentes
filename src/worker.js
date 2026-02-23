const puppeteer = require('puppeteer');
const { createClient } = require('redis');

// Variables de entorno
const REDIS_URL = process.env.REDIS_URL;
const CAPTCHA_KEY = process.env.CAPTCHA_KEY;

const client = createClient({ url: REDIS_URL });

client.on('error', (err) => console.log('🔴 Redis Client Error', err));

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO NUEVA CONSULTA: ${cedula} ---`);
        
        // Configuración crítica para Render
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        
        console.log('🌐 1. Conectando a la Policía Nacional...');
        await page.goto('https://srvandroid.policia.gov.co/ some-url-here', { waitUntil: 'networkidle2', timeout: 60000 });

        // --- AQUÍ VA TU LÓGICA DE CLICS Y CAPTCHA ---
        // (Asegúrate de que tus selectores sean correctos)
        
        console.log('⚖️ 2. Aceptando términos...');
        // Ejemplo: await page.click('#btnAceptar');

        console.log('🧩 3. Identificando ReCaptcha...');
        // Lógica de 2Captcha aquí...

        const resultadoSimulado = "No tiene antecedentes vigentes"; // Cambia esto por el scraping real

        console.log('📄 9. GUARDANDO RESULTADO EN REDIS...');
        await client.set(`resultado:${cedula}`, resultadoSimulado, {
            EX: 3600 // El resultado expira en 1 hora
        });

    } catch (error) {
        console.error(`❌ ERROR EN EL PROCESO (${cedula}):`, error.message);
        await client.set(`resultado:${cedula}`, "Error en la consulta. Reintente.");
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE LA TAREA: ${cedula} ---`);
    }
}

async function iniciarWorker() {
    try {
        if (!client.isOpen) await client.connect();
        console.log('🚀 WORKER LISTO Y CONECTADO A REDIS');

        while (true) {
            console.log('👀 Esperando nueva tarea en "cola_consultas"...');
            // brPop espera hasta que llegue algo (bloqueante)
            const tarea = await client.brPop('cola_consultas', 0);
            
            if (tarea) {
                const data = JSON.parse(tarea.element);
                console.log('🔔 ¡TAREA RECIBIDA!');
                await ejecutarScraping(data.cedula);
            }
        }
    } catch (err) {
        console.error('🔴 ERROR CRÍTICO EN WORKER:', err);
        // Reintenta conectar en 5 segundos si falla
        setTimeout(iniciarWorker, 5000);
    }
}

// Servidor de salud para que Render no lo mate
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Worker Activo 🤖'));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => {
    console.log('📡 Servidor de salud escuchando en puerto 10000');
    iniciarWorker();
});
