const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

// 1. SERVIDOR WEB PARA RENDER (Obligatorio para que no marque "Failed")
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor de salud activo en puerto ${PORT}`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

client.on('error', err => console.log('❌ Redis Error:', err));

async function iniciarBot() {
    try {
        await client.connect();
        console.log('🤖 Bot conectado a Redis y escuchando...');

        while (true) {
            try {
                const tarea = await client.brPop('cola_consultas', 0);
                if (tarea) {
                    const { cedula } = JSON.parse(tarea.element);
                    console.log(`🔎 Procesando cédula: ${cedula}`);
                    await procesarConsulta(cedula);
                }
            } catch (err) {
                console.error('❌ Error en el ciclo de tarea:', err.message);
                await new Promise(r => setTimeout(r, 2000)); // Esperar antes de reintentar
            }
        }
    } catch (err) {
        console.error('❌ Error de conexión Redis:', err);
        setTimeout(iniciarBot, 5000);
    }
}

async function procesarConsulta(cedula) {
    let browser;
    try {
        console.log('🚀 Iniciando navegador...');
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null, // Importante para Render
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log('🌐 Navegando a la Policía...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Simular un poco de espera humana
        await new Promise(r => setTimeout(r, 2000));

        // Intento de lectura de pantalla
        const content = await page.evaluate(() => document.body.innerText.substring(0, 100));
        console.log(`📄 Contenido inicial: ${content}...`);

        // Aquí iría el resto de tu lógica de teclado/clic...
        // Por ahora cerramos para probar estabilidad
        console.log('✅ Prueba de carga exitosa.');

    } catch (error) {
        console.error(`❌ Error en Puppeteer: ${error.message}`);
    } finally {
        if (browser) await browser.close();
        console.log('📦 Navegador cerrado.');
    }
}

iniciarBot();
