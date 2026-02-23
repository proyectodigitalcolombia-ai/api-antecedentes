const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

// --- CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
// Si prefieres pegarla aquí, cambia process.env.CAPTCHA_KEY por "TU_LLAVE_AQUÍ" entre comillas
const CAPTCHA_KEY = process.env.CAPTCHA_KEY || "TU_API_KEY_AQUÍ"; 

const solver = new Solver(CAPTCHA_KEY);
const client = createClient({ url: REDIS_URL });

client.on('error', (err) => console.log('🔴 Redis Client Error', err));

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO NUEVA CONSULTA: ${cedula} ---`);
        
        const chromePath = '/opt/render/project/src/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';

        browser = await puppeteer.launch({
            headless: "new",
            executablePath: chromePath,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
        });

        const page = await browser.newPage();
        
        // 1. Ir a la página oficial
        console.log('🌐 1. Entrando a la página de la Policía...');
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 2. Aceptar Términos y Condiciones
        console.log('⚖️ 2. Aceptando términos...');
        await page.waitForSelector('input[type="checkbox"]');
        await page.click('input[type="checkbox"]');
        await page.click('#continuarPasoSiguiente'); // ID común en esta web

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

        // 4. Inyectar Token y Cédula
        await page.evaluate((token) => {
            document.querySelector('#g-recaptcha-response').innerHTML = token;
        }, result.data);

        // Los IDs de la policía suelen ser dinámicos, estos son los más comunes:
        await page.type('input[id*="cedulaInput"]', cedula);
        await page.click('button[id*="btnConsultar"]');

        // 5. Capturar Resultado
        console.log('📄 4. Extrayendo resultado...');
        await page.waitForTimeout(5000); 
        
        const data = await page.evaluate(() => {
            const cuerpo = document.body.innerText;
            if (cuerpo.includes('No tiene asuntos pendientes')) {
                return "NO TIENE ANTECEDENTES VIGENTES";
            } else if (cuerpo.includes('Sujeto a validación')) {
                return "REQUIERE VALIDACIÓN ADICIONAL";
            } else {
                return "REVISAR RESULTADO DIRECTAMENTE";
            }
        });

        // 6. Guardar en Redis
        await client.set(`resultado:${cedula}`, data, { EX: 86400 });
        console.log(`✅ Consulta finalizada con éxito para ${cedula}`);

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
        console.log('🚀 WORKER CONECTADO Y ESCUCHANDO...');
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
app.get('/', (req, res) => res.send('Bot Worker Corriendo 🤖'));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => iniciarWorker());
