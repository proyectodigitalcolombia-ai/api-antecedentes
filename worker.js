const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

// --- MINI SERVIDOR PARA RENDER ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot Activo 🤖'));
app.listen(PORT, '0.0.0.0', () => console.log(`- Puerto ${PORT} abierto para Render -`));

// --- CONFIGURACIÓN ---
const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function iniciarBot() {
    await client.connect();
    console.log('🤖 Bot operativo y conectado a Redis');

    while (true) {
        try {
            const tarea = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tarea.element);
            console.log(`\n🔎 --- PROCESANDO CÉDULA: ${cedula} ---`);
            await procesarConsulta(cedula);
        } catch (error) {
            console.error('❌ Error en el ciclo:', error.message);
        }
    }
}

async function procesarConsulta(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
        
        console.log('🌐 Navegando a la nueva URL de la Policía...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        // Manejo de términos y condiciones (si aparecen)
        try {
            await page.waitForSelector('input[type="checkbox"]', { timeout: 15000 });
            await page.click('input[type="checkbox"]');
            await page.click('input[type="submit"]');
            console.log('✅ Términos aceptados.');
        } catch (e) {
            console.log('ℹ️ Omitiendo términos (no aparecieron).');
        }

        console.log('🧠 Resolviendo Captcha...');
        await page.waitForSelector('img[id*="captcha"]', { timeout: 20000 });
        const captchaElement = await page.$('img[id*="captcha"]');
        const screenshot = await captchaElement.screenshot({ encoding: 'base64' });

        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Captcha resuelto: ${res.data}`);

        // Llenar formulario
        await page.type('input[id*="cedula"]', cedula);
        await page.type('input[id*="captcha"]', res.data);
        await page.click('button[id*="consultar"]');

        await new Promise(r => setTimeout(r, 5000));

        const resultado = await page.evaluate(() => {
            const body = document.body.innerText;
            if (body.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (body.includes('registra antecedentes')) return "CON ANTECEDENTES";
            return "ERROR EN CONSULTA";
        });

        console.log(`🏁 RESULTADO PARA ${cedula}: ${resultado}`);
    } catch (error) {
        console.error(`❌ Fallo: ${error.message}`);
    } finally {
        await browser.close();
    }
}

iniciarBot();
