const { createClient } = require('redis');
const puppeteer = require('puppeteer');
const Captcha = require('2captcha');

// Configuramos el solver usando la Variable de Entorno
const SOLVER_API_KEY = process.env.CAPTCHA_KEY || 'fd9177f1a724968f386c07483252b4e8';
const solver = new Captcha.Solver(SOLVER_API_KEY);

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const client = createClient({ url: REDIS_URL });

async function ejecutarScraping(cedula) {
    console.log(`🤖 [BOT] Consultando Policía para la cédula: ${cedula}`);
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log(`🌐 Abriendo página de la Policía...`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/index.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 1. Aceptar Términos
        console.log(`⚖️ Aceptando términos...`);
        await page.waitForSelector('input[type="checkbox"]');
        await page.click('input[type="checkbox"]');
        
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        // 2. Resolver Captcha
        console.log(`🧩 Solicitando resolución de Captcha a 2Captcha...`);
        const sitekey = await page.evaluate(() => {
            return document.querySelector('.g-recaptcha').getAttribute('data-sitekey');
        });

        const res = await solver.recaptcha(sitekey, page.url());
        console.log(`✅ Captcha resuelto exitosamente.`);

        // Inyectar solución
        await page.evaluate((token) => {
            document.querySelector('#g-recaptcha-response').innerHTML = token;
        }, res.data);

        // 3. Formulario de Cédula
        console.log(`✍️ Ingresando datos...`);
        await page.waitForSelector('#procesoPoli\\:cedulaInput');
        await page.type('#procesoPoli\\:cedulaInput', cedula);

        console.log(`🔍 Clic en Consultar...`);
        await page.click('#procesoPoli\\:btnConsultar');

        // 4. Esperar resultado (Damos 5 segundos para que cargue el mensaje)
        await new Promise(r => setTimeout(r, 5000));

        const textoResultado = await page.evaluate(() => {
            const el = document.querySelector('.ui-messages-info-detail') || 
                       document.querySelector('.ui-messages-error-detail') ||
                       document.body;
            return el ? el.innerText : "No se detectó texto de respuesta";
        });

        console.log(`📄 RESULTADO FINAL: ${textoResultado}`);
        
        // Guardar resultado en Redis por 1 hora
        await client.set(`resultado:${cedula}`, textoResultado, { EX: 3600 });

    } catch (error) {
        console.error(`❌ Error en el proceso del Bot:`, error.message);
    } finally {
        await browser.close();
        console.log(`🏁 Bot libre para la siguiente tarea.`);
    }
}

async function iniciarWorker() {
    try {
        await client.connect();
        console.log('🚀 Worker conectado a Redis. Esperando órdenes...');

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarScraping(cedula);
            }
        }
    } catch (err) {
        console.error('🔴 Error crítico en el Worker:', err);
    }
}

iniciarWorker();
