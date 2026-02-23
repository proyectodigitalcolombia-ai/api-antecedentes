const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

// --- CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
// Aquí puedes poner tu API Key directamente o usar la variable de Render
const CAPTCHA_KEY = process.env.CAPTCHA_KEY || "TU_API_KEY_AQUÍ"; 

const solver = new Solver(CAPTCHA_KEY);
const client = createClient({ url: REDIS_URL });

client.on('error', (err) => console.log('🔴 Redis Client Error', err));

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO NUEVA CONSULTA: ${cedula} ---`);
        
        // RUTA EXACTA según tu log de instalación en Render
        const chromePath = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';
        
        console.log(`🔍 Forzando apertura de Chrome en: ${chromePath}`);

        browser = await puppeteer.launch({
            headless: "new",
            executablePath: chromePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--no-zygote'
            ]
        });

        const page = await browser.newPage();
        
        // Evitar detecciones básicas
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log('🌐 1. Conectando a la Policía Nacional...');
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 2. Aceptar términos y condiciones
        console.log('⚖️ 2. Aceptando términos...');
        await page.waitForSelector('input[type="checkbox"]', { timeout: 15000 });
        await page.click('input[type="checkbox"]');
        await page.click('#continuarPasoSiguiente');

        // 3. Resolver Captcha
        console.log('🧩 3. Resolviendo Captcha con 2Captcha...');
        const siteKey = await page.evaluate(() => {
            const el = document.querySelector('.g-recaptcha');
            return el ? el.getAttribute('data-sitekey') : '6LdX80EUAAAAAL6v5yM8S7L9S7S7S7S7S7S7';
        });

        const result = await solver.recaptcha({
            pageurl: page.url(),
            googlekey: siteKey
        });

        console.log('✅ Captcha resuelto');

        // 4. Inyectar Token y enviar formulario
        await page.evaluate((token) => {
            const responseField = document.querySelector('#g-recaptcha-response');
            if (responseField) responseField.innerHTML = token;
        }, result.data);

        // Ajuste de selectores de la Policía (pueden variar, estos son los comunes)
        await page.type('input[id*="cedulaInput"]', cedula);
        await page.click('button[id*="btnConsultar"]');

        // 5. Capturar Resultado
        console.log('📄 4. Extrayendo respuesta final...');
        await new Promise(r => setTimeout(r, 6000)); // Esperar carga de la respuesta
        
        const data = await page.evaluate(() => {
            const cuerpo = document.body.innerText;
            if (cuerpo.includes('No tiene asuntos pendientes')) return "NO TIENE ANTECEDENTES VIGENTES";
            if (cuerpo.includes('Sujeto a validación')) return "REQUIERE VALIDACIÓN ADICIONAL";
            return "RESULTADO DESCONOCIDO - REVISAR MANUALMENTE";
        });

        // 6. Guardar en Redis
        await client.set(`resultado:${cedula}`, data, { EX: 86400 });
        console.log(`✅ Consulta finalizada para ${cedula}`);

    } catch (error) {
        console.error(`❌ ERROR (${cedula}):`, error.message);
        await client.set(`resultado:${cedula}`, `Error: ${error.message}`, { EX: 3600 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE LA TAREA: ${cedula} ---`);
    }
}

async function iniciarWorker() {
    try {
        if (!client.isOpen) await client.connect();
        console.log('🚀 WORKER LISTO Y CONECTADO A REDIS');
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                let cedula = tarea.element;
                try { 
                    const dataObj = JSON.parse(tarea.element);
                    cedula = dataObj.cedula;
                } catch(e) {}
                await ejecutarScraping(cedula);
            }
        }
    } catch (err) {
        console.error('🔴 ERROR EN WORKER:', err);
        setTimeout(iniciarWorker, 5000);
    }
}

const app = express();
app.get('/', (req, res) => res.send('Worker en línea 🤖'));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => iniciarWorker());
