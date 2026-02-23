const { createClient } = require('redis');
const puppeteer = require('puppeteer');
const Captcha = require('2captcha');
const http = require('http');

// --- 1. MINI SERVIDOR PARA RENDER (EVITA ERROR DE PUERTO) ---
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot de Antecedentes Activo\n');
}).listen(port, () => {
    console.log(`📡 Servidor de salud escuchando en puerto ${port}`);
});

// --- 2. CONFIGURACIÓN DE APIS ---
const SOLVER_API_KEY = process.env.CAPTCHA_KEY || 'fd9177f1a724968f386c07483252b4e8';
const solver = new Captcha.Solver(SOLVER_API_KEY);

const REDIS_URL = process.env.REDIS_URL;
const client = createClient({ url: REDIS_URL });

// --- 3. LÓGICA DE SCRAPING ---
async function ejecutarScraping(cedula) {
    console.log(`\n--- 🤖 INICIANDO NUEVA CONSULTA: ${cedula} ---`);
    
    const browser = await puppeteer.launch({
        headless: "new",
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
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/index.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        console.log(`⚖️ 2. Aceptando términos...`);
        await page.waitForSelector('input[type="checkbox"]', { timeout: 15000 });
        await page.click('input[type="checkbox"]');
        
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        console.log(`🧩 3. Identificando ReCaptcha...`);
        const sitekey = await page.evaluate(() => {
            const el = document.querySelector('.g-recaptcha');
            return el ? el.getAttribute('data-sitekey') : null;
        });

        if (!sitekey) throw new Error("No se pudo encontrar el SiteKey.");

        console.log(`⏳ 4. Solicitando solución a 2Captcha...`);
        const res = await solver.recaptcha(sitekey, page.url());
        console.log(`✅ 5. Token de captcha recibido.`);

        await page.evaluate((token) => {
            document.querySelector('#g-recaptcha-response').innerHTML = token;
        }, res.data);

        console.log(`✍️ 6. Ingresando cédula: ${cedula}`);
        const inputId = '#procesoPoli\\:cedulaInput';
        const btnId = '#procesoPoli\\:btnConsultar';

        await page.waitForSelector(inputId, { timeout: 10000 });
        await page.type(inputId, cedula);

        console.log(`🔍 7. Clic en Consultar...`);
        await page.click(btnId);

        console.log(`⏳ 8. Esperando respuesta final...`);
        await new Promise(r => setTimeout(r, 8000)); 

        const resultadoFinal = await page.evaluate(() => {
            const info = document.querySelector('.ui-messages-info-detail');
            const error = document.querySelector('.ui-messages-error-detail');
            const tabla = document.querySelector('#procesoPoli\\:panelResultado');
            
            if (info) return info.innerText;
            if (error) return "ERROR: " + error.innerText;
            if (tabla) return "EXITO: Datos encontrados.";
            return "No se pudo determinar el resultado.";
        });

        console.log(`📄 9. RESULTADO: ${resultadoFinal}`);
        await client.set(`resultado:${cedula}`, resultadoFinal, { EX: 3600 });

    } catch (error) {
        console.error(`❌ ERROR EN SCRAPING:`, error.message);
        await client.set(`resultado:${cedula}`, `Error: ${error.message}`, { EX: 600 });
    } finally {
        await browser.close();
        console.log(`🏁 --- FIN DE CONSULTA: ${cedula} ---\n`);
    }
}

// --- 4. INICIO DEL TRABAJADOR ---
async function iniciarWorker() {
    try {
        if (!client.isOpen) await client.connect();
        console.log('🚀 WORKER LISTO Y CONECTADO A REDIS');

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarScraping(cedula);
            }
        }
    } catch (err) {
        console.error('🔴 Error en Worker:', err);
        setTimeout(iniciarWorker, 5000); 
    }
}

iniciarWorker();
