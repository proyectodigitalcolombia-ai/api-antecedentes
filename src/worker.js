const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');

// CONFIGURACIÓN CENTRAL
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';
const CHROME_PATH = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';

const client = createClient({ url: REDIS_URL });

/**
 * Función para resolver reCAPTCHA v2
 */
async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando SiteKey del captcha...");
        const siteKey = await page.evaluate(() => {
            const element = document.querySelector('.g-recaptcha');
            return element ? element.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) throw new Error("No se pudo extraer la SiteKey");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        
        // 1. Enviar a 2Captcha
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        if (resp.data.status !== 1) throw new Error("2Captcha rechazó el envío: " + resp.data.request);
        
        const requestId = resp.data.request;
        console.log(`⏳ Captcha enviado a 2Captcha (ID: ${requestId}). Esperando solución...`);

        // 2. Poll para obtener el token (espera de 30 a 90 segundos normalmente)
        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            
            if (check.data.status === 1) {
                console.log("✅ Captcha resuelto por el servicio.");
                return check.data.request;
            }
            if (check.data.request !== 'CAPCHA_NOT_READY') {
                throw new Error("Fallo en 2Captcha: " + check.data.request);
            }
            console.log("... el captcha sigue en proceso ...");
        }
    } catch (error) {
        throw new Error("Error en flujo de Captcha: " + error.message);
    }
}

/**
 * Lógica de navegación y extracción
 */
async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA: ${cedula} ---`);
        
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            ignoreDefaultArgs: ['--disable-extensions'],
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log("🔗 Navegando a la web de la Policía...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Paso 1: Términos
        await page.waitForSelector('#continuarBtn', { timeout: 15000 });
        await page.click('#continuarBtn');
        console.log("✅ Términos aceptados.");

        // Paso 2: Datos
        await page.waitForSelector('#form\\:cedulaInput', { timeout: 15000 });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');
        console.log("✍️ Cédula ingresada.");

        // Paso 3: Captcha
        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            document.getElementById('g-recaptcha-response').innerHTML = t;
        }, token);

        // Paso 4: Consultar
        await page.click('#form\\:consultarBtn');
        console.log("🖱️ Clic en consultar realizado.");

        // Paso 5: Extraer Resultado
        // Esperamos a que el panel de resultados aparezca (puede tardar por la carga del sitio)
        await page.waitForSelector('#form\\:panelResultado', { timeout: 30000 });
        const textoResultado = await page.evaluate(() => {
            return document.querySelector('#form\\:panelResultado').innerText;
        });

        console.log("📄 Información extraída.");
        await client.set(`resultado:${cedula}`, JSON.stringify({ 
            cedula, 
            resultado: textoResultado,
            timestamp: new Date().toISOString()
        }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ ERROR: ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE LA TAREA: ${cedula} ---`);
    }
}

// ARRANQUE DEL SERVIDOR Y WORKER
const app = express();
app.get('/', (req, res) => res.send('Worker Activo y Operando 🤖'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', async () => {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 WORKER CONECTADO A REDIS. ESCUCHANDO COLA...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const data = JSON.parse(tarea.element);
                const numCedula = data.cedula || data;
                await ejecutarScraping(numCedula);
                console.log('👀 Esperando siguiente tarea...');
            }
        }
    } catch (err) {
        console.error("Fallo crítico en el worker:", err);
    }
});
