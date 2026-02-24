const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health Check en puerto ${PORT}`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function iniciarBot() {
    await client.connect();
    console.log('🤖 Bot a la espera de cédulas...');

    while (true) {
        try {
            const tarea = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tarea.element);
            console.log(`🔎 PROCESANDO: ${cedula}`);
            await procesarConsulta(cedula);
        } catch (err) {
            console.error('❌ Error:', err.message);
        }
    }
}

async function procesarConsulta(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });

        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2', timeout: 60000 
        });

        // 1. ACEPTAR TÉRMINOS (Lógica de Teclado + JS)
        console.log('📝 Aceptando términos...');
        await page.evaluate(() => {
            const check = document.querySelector('input[type="checkbox"]');
            if (check) check.click();
        });
        await page.keyboard.press('Enter'); 
        
        await new Promise(r => setTimeout(r, 5000));

        // 2. RESOLVER CAPTCHA
        console.log('📸 Capturando Captcha...');
        const captchaImg = await page.waitForSelector('img[id*="captcha"]', { timeout: 20000 });
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Captcha: ${res.data}`);

        // 3. LLENAR DATOS
        await page.type('input[id*="cedula"]', cedula);
        await page.type('input[id*="captcha"]', res.data);
        await page.keyboard.press('Enter');

        console.log('⏳ Esperando veredicto...');
        await new Promise(r => setTimeout(r, 7000));

        // 4. EXTRAER RESULTADO
        const resultado = await page.evaluate(() => {
            const t = document.body.innerText;
            if (t.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (t.includes('registra antecedentes')) return "CON ANTECEDENTES";
            return "ERROR_PAGINA";
        });

        console.log(`🏁 FIN: ${cedula} -> ${resultado}`);
        
        // OPCIONAL: Aquí podrías guardar el resultado en Redis para que la API lo lea
        // await client.set(`res_${cedula}`, resultado, { EX: 3600 });

    } catch (error) {
        console.error(`❌ Error en el proceso: ${error.message}`);
    } finally {
        await browser.close();
        console.log('📦 Navegador cerrado.');
    }
}

iniciarBot();
