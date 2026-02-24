const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot Online 🤖'));
app.listen(PORT, '0.0.0.0', () => console.log(`- Keep-alive activo -`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function iniciarBot() {
    await client.connect();
    console.log('🤖 Bot esperando tareas en Redis...');

    while (true) {
        try {
            const tarea = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tarea.element);
            console.log(`\n🔎 --- PROCESANDO: ${cedula} ---`);
            await procesarConsulta(cedula);
        } catch (error) {
            console.error('❌ Error:', error.message);
        }
    }
}

async function procesarConsulta(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled', // Evita que detecten que es un bot
            '--lang=es-ES,es'
        ]
    });
    
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log('🌐 Navegando a WebJudicial...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        // Verificación de términos
        try {
            const check = await page.waitForSelector('input[type="checkbox"]', { timeout: 10000 });
            if (check) {
                await page.click('input[type="checkbox"]');
                await page.click('input[type="submit"]');
                console.log('✅ Términos aceptados.');
                await new Promise(r => setTimeout(r, 3000));
            }
        } catch (e) {
            console.log('ℹ️ No se vio el checkbox (posible carga directa).');
        }

        // Búsqueda de Captcha con múltiples selectores
        console.log('🧠 Buscando imagen del Captcha...');
        const captchaSelector = 'img[id*="cap"], img[src*="captcha"], img[id*="Captcha"]';
        
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 25000 }).catch(async () => {
            const contenido = await page.evaluate(() => document.body.innerText.substring(0, 300));
            console.error(`❌ La página no mostró el captcha. Texto detectado: "${contenido}"`);
            throw new Error('Captcha no encontrado');
        });

        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Captcha resuelto: ${res.data}`);

        // Llenado de formulario
        await page.type('input[id*="cedula"]', cedula);
        await page.type('input[id*="captcha"], input[id*="answer"]', res.data);
        
        console.log('🚀 Enviando consulta...');
        await page.click('button[id*="consultar"], input[type="submit"]');
        
        await new Promise(r => setTimeout(r, 6000));

        const resultado = await page.evaluate(() => {
            const text = document.body.innerText;
            if (text.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (text.includes('registra antecedentes')) return "CON ANTECEDENTES";
            return "RESULTADO NO CLARO / POSIBLE ERROR";
        });

        console.log(`🏁 FIN: ${cedula} -> ${resultado}`);

    } catch (error) {
        console.error(`❌ Fallo crítico: ${error.message}`);
    } finally {
        await browser.close();
        console.log(`📦 Sesión cerrada.`);
    }
}

iniciarBot();
