const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

// --- CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
const CAPTCHA_KEY = process.env.CAPTCHA_KEY || "TU_API_KEY_AQUÍ"; // Pon tu llave aquí si no la tienes en Render

const solver = new Solver(CAPTCHA_KEY);
const client = createClient({ url: REDIS_URL });

client.on('error', (err) => console.log('🔴 Redis Client Error', err));

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO NUEVA CONSULTA: ${cedula} ---`);
        
        // CAMBIO CLAVE: Puppeteer buscará automáticamente la ruta correcta instalada
        const autoChromePath = puppeteer.executablePath();
        console.log(`🔍 Intentando abrir Chrome en: ${autoChromePath}`);

        browser = await puppeteer.launch({
            headless: "new",
            executablePath: autoChromePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--no-zygote'
            ]
        });

        const page = await browser.newPage();
        
        // Configurar un User Agent real para evitar bloqueos
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log('🌐 1. Conectando a la Policía Nacional...');
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 2. Aceptar términos
        console.log('⚖️ 2. Aceptando términos...');
        await page.waitForSelector('input[type="checkbox"]', { timeout: 10000 });
        await page.click('input[type="checkbox"]');
        await page.click('#continuarPasoSiguiente');

        // 3. Resolver Captcha
        console.log('🧩 3. Identificando y resolviendo Captcha...');
        const siteKey = await page.evaluate(() => {
            const el = document.querySelector('.g-recaptcha');
            return el ? el.getAttribute('data-sitekey') : '6LdX80EUAAAAAL6v5yM8S7L9S7S7S7S7S7S7';
        });

        const solveRes = await solver.recaptcha({
            pageurl: page.url(),
            googlekey: siteKey
        });

        console.log('✅ Captcha resuelto por 2Captcha');

        // 4. Inyectar Token y realizar consulta
        await page.evaluate((token) => {
            document.querySelector('#g-recaptcha-response').innerHTML = token;
        }, solveRes.data);

        await page.type('input[id*="cedulaInput"]', cedula);
        await page.click('button[id*="btnConsultar"]');

        // 5. Extraer Resultado
        console.log('📄 4. Extrayendo información...');
        await new Promise(r => setTimeout(r, 5000)); // Espera prudente
        
        const resultadoFinal = await page.evaluate(() => {
            const text = document.body.innerText;
            if (text.includes('No tiene asuntos pendientes')) return "NO TIENE ANTECEDENTES";
            if (text.includes('Sujeto a validación')) return "REQUIERE VALIDACIÓN MANUAL";
            return "ERROR: No se pudo determinar el estado o cédula no encontrada";
        });

        // 6. Guardar en Redis
        await client.set(`resultado:${cedula}`, resultadoFinal, { EX: 86400 });
        console.log(`✅ Resultado guardado para ${cedula}: ${resultadoFinal}`);

    } catch (error) {
        console.error(`❌ ERROR EN EL PROCESO (${cedula}):`, error.message);
        await client.set(`resultado:${cedula}`, `Error: ${error.message}`, { EX: 3600 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE LA TAREA: ${cedula} ---`);
    }
}

async function iniciarWorker() {
    try {
        if (!client.isOpen) await client.connect();
        console.log('🚀 WORKER CONECTADO Y ESCUCHANDO COLA...');

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                let cedula;
                try {
                    const data = JSON.parse(tarea.element);
                    cedula = data.cedula;
                } catch (e) {
                    cedula = tarea.element;
                }
                await ejecutarScraping(cedula);
            }
        }
    } catch (err) {
        console.error('🔴 ERROR CRÍTICO:', err);
        setTimeout(iniciarWorker, 5000);
    }
}

const app = express();
app.get('/', (req, res) => res.send('Worker Activo 🤖'));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => iniciarWorker());
