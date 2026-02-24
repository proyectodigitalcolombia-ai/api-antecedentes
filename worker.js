const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express'); // <--- NUEVO

// --- ENGAÑO PARA RENDER (PORT BINDING) ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot Vivo 🤖'));
app.listen(PORT, '0.0.0.0', () => {
    console.log(`- Dummy port open on ${PORT} to please Render -`);
});
// -----------------------------------------

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

client.on('error', (err) => console.error('❌ Error en Redis:', err));

async function iniciarBot() {
    await client.connect();
    console.log('🤖 Bot operativo con 2Captcha y conectado a Redis');

    while (true) {
        try {
            const tarea = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tarea.element);
            console.log(`\n🔎 --- NUEVA TAREA: ${cedula} ---`);
            await procesarConsulta(cedula);
        } catch (error) {
            console.error('❌ Error en el ciclo del Bot:', error.message);
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
        console.log('🌐 Entrando a la web de la Policía (Puerto 7005)...');
        await page.goto('https://antecedentes.policia.gov.co:7005/antecedentes/consultarAntecedentes.xhtml', {
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        console.log('📝 Esperando pantalla de términos...');
        await page.waitForSelector('input[type="checkbox"]', { timeout: 40000 });
        await page.click('input[type="checkbox"]');
        console.log('✅ Términos aceptados.');

        await page.waitForSelector('input[type="submit"]', { timeout: 10000 });
        await page.click('input[type="submit"]');

        console.log('🧠 Esperando imagen del Captcha...');
        await page.waitForSelector('img[id*="captcha"]', { timeout: 20000 });
        const captchaElement = await page.$('img[id*="captcha"]');
        const screenshot = await captchaElement.screenshot({ encoding: 'base64' });

        console.log('📤 Enviando a 2Captcha...');
        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Captcha resuelto: ${res.data}`);

        await page.type('input[id*="cedula"]', cedula);
        await page.type('input[id*="captcha"]', res.data);
        await page.click('button[id*="consultar"]');

        console.log('📄 Obteniendo respuesta final...');
        await new Promise(r => setTimeout(r, 5000)); // Espera manual de 5 seg

        const resultado = await page.evaluate(() => {
            return document.body.innerText.includes('No tiene asuntos pendientes') 
                ? "LIMPIO" 
                : "TIENE ANTECEDENTES O ERROR";
        });
        console.log(`🏁 RESULTADO PARA ${cedula}: ${resultado}`);
    } catch (error) {
        console.error(`❌ Fallo en el proceso: ${error.message}`);
    } finally {
        await browser.close();
        console.log(`🏁 Sesión cerrada para ${cedula}`);
    }
}

iniciarBot();
