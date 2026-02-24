const redis = require('redis');
const puppeteer = require('puppeteer');
const TwoCaptcha = require('2captcha'); // Paquete oficial
const http = require('http');

const REDIS_URL = process.env.REDIS_URL || 'redis://default:xU5AJJoh3pN1wo9dQqExFAiKJgKUFM0T@red-d6d4md5m5p6s73f5i2jg:6379';
const solver = new TwoCaptcha.Solver(process.env.TWO_CAPTCHA_KEY);
const client = redis.createClient({ url: REDIS_URL });

// Servidor dummy para Render (Evita errores de puerto)
http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot Worker Activo");
}).listen(10000);

async function realizarNavegacion(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const page = await browser.newPage();
        console.log(`🌐 Navegando para cédula: ${cedula}`);
        
        // --- INICIO FLUJO POLICÍA ---
        await page.goto('https://srvandroid.policia.gov.co/Antecedentes/', { waitUntil: 'networkidle2' });

        // Aceptar términos
        await page.waitForSelector('#radAcepto', { timeout: 10000 });
        await page.click('#radAcepto'); 
        await page.click('#btnContinuar');

        // Capturar Captcha
        await page.waitForSelector('#imgCaptcha');
        const captchaImg = await page.$('#imgCaptcha');
        const captchaBase64 = await captchaImg.screenshot({ encoding: 'base64' });
        
        console.log("🧩 Resolviendo captcha con 2Captcha...");
        const resCaptcha = await solver.imageCaptcha(captchaBase64);
        console.log(`✅ Captcha resuelto: ${resCaptcha.data}`);

        // Llenar formulario
        await page.type('#txtDocumento', cedula);
        await page.type('#txtCaptcha', resCaptcha.data);
        await page.click('#btnConsultar');

        // Extraer texto (Ajustar selector si es distinto a #lblMensaje)
        await page.waitForSelector('#lblMensaje', { timeout: 15000 });
        const textoResult = await page.$eval('#lblMensaje', el => el.innerText);

        // --- GUARDAR EN REDIS ---
        const infoFinal = { status: "exito", data: textoResult, actualizado: new Date() };
        await client.set(`resultado:${cedula}`, JSON.stringify(infoFinal), { EX: 86400 });
        console.log(`🏆 Resultado guardado para ${cedula}`);

    } catch (error) {
        console.error("🚨 Error en proceso:", error.message);
        await client.set(`resultado:${cedula}`, JSON.stringify({ status: "error", msg: error.message }), { EX: 3600 });
    } finally {
        await browser.close();
    }
}

async function iniciar() {
    await client.connect();
    console.log("🚀 BOT WORKER LISTO. Escuchando cola_consultas...");
    
    while (true) {
        const tarea = await client.blPop('cola_consultas', 0);
        const { cedula } = JSON.parse(tarea.element);
        await realizarNavegacion(cedula);
    }
}

iniciar().catch(console.error);
