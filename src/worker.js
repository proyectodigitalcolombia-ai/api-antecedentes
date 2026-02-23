const { createClient } = require('redis');
const puppeteer = require('puppeteer');
const Captcha = require('2captcha');

// Configuración de Seguridad y API
const SOLVER_API_KEY = process.env.CAPTCHA_KEY || 'fd9177f1a724968f386c07483252b4e8';
const solver = new Captcha.Solver(SOLVER_API_KEY);

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const client = createClient({ url: REDIS_URL });

async function ejecutarScraping(cedula) {
    console.log(`\n--- 🤖 INICIANDO NUEVA CONSULTA: ${cedula} ---`);
    
    const browser = await puppeteer.launch({
        headless: "new",
        // Usamos el Chrome preinstalado en Render para que el deploy sea veloz
        executablePath: '/usr/bin/google-chrome', 
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

        console.log(`🌐 1. Conectando a la Policía Nacional...`);
        const response = await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/index.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        if (response.status() !== 200) {
            throw new Error(`La página respondió con status ${response.status()}. Posible bloqueo de IP.`);
        }

        // --- PASO 1: ACEPTAR TÉRMINOS ---
        console.log(`⚖️ 2. Aceptando términos...`);
        await page.waitForSelector('input[type="checkbox"]', { timeout: 15000 });
        await page.click('input[type="checkbox"]');
        
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        // --- PASO 2: RESOLVER CAPTCHA ---
        console.log(`🧩 3. Identificando ReCaptcha...`);
        const sitekey = await page.evaluate(() => {
            const el = document.querySelector('.g-recaptcha');
            return el ? el.getAttribute('data-sitekey') : null;
        });

        if (!sitekey) throw new Error("No se pudo encontrar el SiteKey.");

        console.log(`⏳ 4. Resolviendo via 2Captcha (espera 45s)...`);
        const res = await solver.recaptcha(sitekey, page.url());
        console.log(`✅ 5. Token de captcha recibido.`);

        await page.evaluate((token) => {
            document.querySelector('#g-recaptcha-response').innerHTML = token;
        }, res.data);

        // --- PASO 3: FORMULARIO ---
        console.log(`✍️ 6. Ingresando cédula: ${cedula}`);
        const inputId = '#procesoPoli\\:cedulaInput';
        const btnId = '#procesoPoli\\:btnConsultar';

        await page.waitForSelector(inputId, { timeout: 10000 });
        await page.type(inputId, cedula);

        console.log(`🔍 7. Clic en Consultar...`);
        await page.click(btnId);

        // --- PASO 4: RESULTADO ---
        console.log(`⏳ 8. Esperando respuesta final...`);
        await new Promise(r => setTimeout(r, 8000));

        const resultadoFinal = await page.evaluate(() => {
            const info = document.querySelector('.ui-messages-info-detail');
            const error = document.querySelector('.ui-messages-error-detail');
            const tabla = document.querySelector('#procesoPoli\\:panelResultado');
            
            if (info) return info.innerText;
            if (error) return "ERROR POLICÍA: " + error.innerText;
            if (tabla) return "TABLA: " + tabla.innerText;
            
            return "No se detectó respuesta. Revisa si la cédula es correcta.";
        });

        console.log(`📄 9. RESULTADO: ${resultadoFinal}`);
        await client.set(`resultado:${cedula}`, resultadoFinal, { EX: 3600 });

    } catch (error) {
        console.error(`❌ ERROR:`, error.message);
        await client.set(`resultado:${cedula}`, `Error: ${error.message}`, { EX: 600 });
    } finally {
        await browser.close();
        console.log(`🏁 --- FIN: ${cedula} ---\n`);
    }
}

async function iniciarWorker() {
    try {
        await client.connect();
        console.log('🚀 WORKER LISTO Y CONECTADO A REDIS');

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarScraping(cedula);
            }
        }
    } catch (err) {
        console.error('🔴 Error Redis:', err);
    }
}

iniciarWorker();
