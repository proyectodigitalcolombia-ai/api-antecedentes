const redis = require('redis');
const puppeteer = require('puppeteer');
const Captcha = require('2captcha');

const solver = new Captcha.Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function procesar(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
    });

    const page = await browser.newPage();
    try {
        console.log(`🔎 Trabajando en: ${cedula}`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/', { waitUntil: 'networkidle2' });

        // Aceptar términos (Selectores estándar de la web de la Policía)
        await page.waitForSelector('input[type="checkbox"]');
        await page.click('input[type="checkbox"]');
        await page.click('input[name="proximo.x"]');
        
        await page.waitForNavigation();

        // Capturar Captcha
        const captchaImg = await page.waitForSelector('img[src*="vencaptcha"]');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        
        console.log('🧠 Resolviendo Captcha...');
        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Solución: ${res.data}`);

        // Rellenar formulario
        await page.type('#cedulaInput', cedula);
        await page.type('#captchaInput', res.data);
        await page.click('input[name="consultar.x"]');

        await page.waitForTimeout(2000);
        const texto = await page.evaluate(() => document.body.innerText);
        console.log(`📄 RESULTADO ${cedula}: ${texto.includes('NO TIENE ASUNTOS') ? 'LIMPIO' : 'REVISAR'}`);

    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
    } finally {
        await browser.close();
    }
}

async function start() {
    await client.connect();
    console.log('🤖 Bot operativo y conectado a Redis');
    while (true) {
        // blPop espera hasta que llegue algo a 'cola_consultas'
        const tarea = await client.blPop('cola_consultas', 0);
        await procesar(tarea.element);
    }
}
start();
