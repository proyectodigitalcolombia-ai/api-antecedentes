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
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // Simular un navegador real para evitar bloqueos
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
        console.log(`⚖️ 2. Aceptando términos y condiciones...`);
        await page.waitForSelector('input[type="checkbox"]', { timeout: 10000 });
        await page.click('input[type="checkbox"]');
        
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        // --- PASO 2: RESOLVER CAPTCHA ---
        console.log(`🧩 3. Identificando Captcha...`);
        const sitekey = await page.evaluate(() => {
            const el = document.querySelector('.g-recaptcha');
            return el ? el.getAttribute('data-sitekey') : null;
        });

        if (!sitekey) throw new Error("No se pudo encontrar el SiteKey del ReCaptcha.");

        console.log(`⏳ 4. Enviando a 2Captcha (Esto tardará 30-60 seg)...`);
        const res = await solver.recaptcha(sitekey, page.url());
        console.log(`✅ 5. Captcha resuelto por 2Captcha.`);

        // Inyectar el token en el campo oculto
        await page.evaluate((token) => {
            document.querySelector('#g-recaptcha-response').innerHTML = token;
        }, res.data);

        // --- PASO 3: FORMULARIO ---
        console.log(`✍️ 6. Ingresando cédula: ${cedula}`);
        const inputId = '#procesoPoli\\:cedulaInput';
        const btnId = '#procesoPoli\\:btnConsultar';

        await page.waitForSelector(inputId, { timeout: 10000 });
        await page.type(inputId, cedula);

        console.log(`🔍 7. Haciendo clic en Consultar...`);
        await page.click(btnId);

        // --- PASO 4: RESULTADO ---
        console.log(`⏳ 8. Esperando respuesta final...`);
        // Esperamos a que el sistema procese el AJAX
        await new Promise(r => setTimeout(r, 8000));

        const resultadoFinal = await page.evaluate(() => {
            // Buscamos mensajes de éxito, error o el panel de resultados
            const info = document.querySelector('.ui-messages-info-detail');
            const error = document.querySelector('.ui-messages-error-detail');
            const tabla = document.querySelector('#procesoPoli\\:panelResultado');
            
            if (info) return info.innerText;
            if (error) return "ERROR POLICÍA: " + error.innerText;
            if (tabla) return "RESULTADO: " + tabla.innerText;
            
            return "No se detectó respuesta visual. Puede que el captcha haya expirado o la sesión se cerró.";
        });

        console.log(`📄 9. RESULTADO OBTENIDO: ${resultadoFinal}`);
        
        // Guardar resultado en Redis (Clave: resultado:12345678)
        await client.set(`resultado:${cedula}`, resultadoFinal, { EX: 3600 });

    } catch (error) {
        console.error(`❌ ERROR CRÍTICO:`, error.message);
        await client.set(`resultado:${cedula}`, `Error: ${error.message}`, { EX: 600 });
    } finally {
        await browser.close();
        console.log(`🏁 --- FIN DEL PROCESO PARA ${cedula} ---\n`);
    }
}

async function iniciarWorker() {
    try {
        await client.connect();
        console.log('🚀 WORKER CONECTADO A REDIS. Esperando tareas en "cola_consultas"...');

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarScraping(cedula);
            }
        }
    } catch (err) {
        console.error('🔴 Error de conexión en el Worker:', err);
    }
}

iniciarWorker();
