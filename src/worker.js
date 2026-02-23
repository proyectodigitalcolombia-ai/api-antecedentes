const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const { Solver } = require('2captcha');
const express = require('express');
const fs = require('fs'); // Añadimos esto para verificar carpetas

const REDIS_URL = process.env.REDIS_URL;
const CAPTCHA_KEY = process.env.CAPTCHA_KEY || "TU_API_KEY_AQUÍ";

const solver = new Solver(CAPTCHA_KEY);
const client = createClient({ url: REDIS_URL });

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO NUEVA CONSULTA: ${cedula} ---`);
        
        // Intentamos las dos rutas posibles donde Render suele instalar Chrome
        const rutasPosibles = [
            '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome',
            '/opt/render/project/src/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome'
        ];

        let chromePath = '';
        for (const ruta of rutasPosibles) {
            if (fs.existsSync(ruta)) {
                chromePath = ruta;
                console.log(`✅ Chrome encontrado en: ${ruta}`);
                break;
            }
        }

        if (!chromePath) {
            throw new Error("No se encontró el ejecutable de Chrome en ninguna ruta conocida.");
        }

        browser = await puppeteer.launch({
            headless: "new",
            executablePath: chromePath,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
        });

        const page = await browser.newPage();
        console.log('🌐 1. Conectando a la Policía...');
        
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // --- LÓGICA DE CAPTCHA Y EXTRACCIÓN (Igual que antes) ---
        await page.waitForSelector('input[type="checkbox"]');
        await page.click('input[type="checkbox"]');
        await page.click('#continuarPasoSiguiente');

        const siteKey = await page.evaluate(() => {
            return document.querySelector('.g-recaptcha')?.getAttribute('data-sitekey') || '6LdX80EUAAAAAL6v5yM8S7L9S7S7S7S7S7S7';
        });

        const result = await solver.recaptcha({ pageurl: page.url(), googlekey: siteKey });
        
        await page.evaluate((token) => {
            document.querySelector('#g-recaptcha-response').innerHTML = token;
        }, result.data);

        await page.type('input[id*="cedulaInput"]', cedula);
        await page.click('button[id*="btnConsultar"]');
        
        await new Promise(r => setTimeout(r, 5000));
        const resText = await page.evaluate(() => document.body.innerText);
        const finalData = resText.includes('No tiene asuntos pendientes') ? "SIN ANTECEDENTES" : "REVISAR";

        await client.set(`resultado:${cedula}`, finalData, { EX: 86400 });
        console.log(`✅ Proceso completado para ${cedula}`);

    } catch (error) {
        console.error(`❌ ERROR REAL:`, error.message);
        await client.set(`resultado:${cedula}`, `Error: ${error.message}`, { EX: 3600 });
    } finally {
        if (browser) await browser.close();
    }
}

// ... Resto del código (iniciarWorker y Express) igual ...
async function iniciarWorker() {
    if (!client.isOpen) await client.connect();
    console.log('🚀 WORKER CONECTADO');
    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            let d = JSON.parse(tarea.element);
            await ejecutarScraping(d.cedula || d);
        }
    }
}
const app = express();
app.get('/', (req, res) => res.send('OK'));
app.listen(process.env.PORT || 10000, () => iniciarWorker());
