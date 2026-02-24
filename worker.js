const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot Status: Online 🤖'));
app.listen(PORT, '0.0.0.0', () => console.log(`- Keep-alive port ${PORT} active -`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function iniciarBot() {
    await client.connect();
    console.log('🤖 Bot vinculado a Redis. Esperando órdenes...');

    while (true) {
        try {
            const tarea = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tarea.element);
            console.log(`\n🔎 --- PROCESANDO: ${cedula} ---`);
            await procesarConsulta(cedula);
        } catch (error) {
            console.error('❌ Error en ciclo principal:', error.message);
        }
    }
}

async function procesarConsulta(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
    const page = await browser.newPage();
    
    try {
        // Simular un navegador real para evitar bloqueos
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('🌐 Accediendo a WebJudicial...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        // Paso 1: Aceptar términos si aparecen
        try {
            const checkSelector = 'input[type="checkbox"], [id*="terminos"]';
            await page.waitForSelector(checkSelector, { timeout: 7000 });
            await page.click(checkSelector);
            await page.click('input[type="submit"], [id*="continuar"]');
            console.log('✅ Términos aceptados');
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.log('ℹ️ Checkbox de términos no detectado, continuando...');
        }

        // Paso 2: Localizar Captcha con selectores múltiples
        console.log('🧠 Buscando Captcha...');
        const captchaSelector = 'img[src*="captcha"], img[id*="cap"], img[id*="Captcha"]';
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 20000 });
        
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const sol = await solver.imageCaptcha(screenshot);
        console.log(`✅ Solución obtenida: ${sol.data}`);

        // Paso 3: Llenar formulario
        await page.waitForSelector('input[id*="cedula"]', { timeout: 5000 });
        await page.type('input[id*="cedula"]', cedula);
        
        const captchaInput = await page.waitForSelector('input[id*="captcha"], input[id*="answer"]');
        await captchaInput.type(sol.data);
        
        console.log('🚀 Consultando...');
        await Promise.all([
            page.click('button[id*="consultar"], [id*="btnConsultar"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);

        // Paso 4: Extraer resultado
        const resultado = await page.evaluate(() => {
            const t = document.body.innerText;
            if (t.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (t.includes('registra antecedentes')) return "CON ANTECEDENTES";
            return "RESULTADO DESCONOCIDO O ERROR DE PÁGINA";
        });

        console.log(`🏁 FIN: ${cedula} -> ${resultado}`);

    } catch (error) {
        console.error(`❌ Error en el proceso: ${error.message}`);
        // Si el captcha falló, podríamos tomar una captura de pantalla para debug (opcional)
    } finally {
        await browser.close();
        console.log(`📦 Sesión cerrada.`);
    }
}

iniciarBot();
