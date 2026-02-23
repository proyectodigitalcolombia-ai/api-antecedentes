const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');

// 1. Configuración de Credenciales y Rutas
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';
const CHROME_PATH = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';

const client = createClient({ url: REDIS_URL });

// Función para resolver el reCAPTCHA usando 2Captcha
async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando SiteKey del captcha...");
        const siteKey = await page.evaluate(() => {
            return document.querySelector('.g-recaptcha').getAttribute('data-sitekey');
        });

        if (!siteKey) throw new Error("No se encontró la SiteKey en la página");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        
        // Enviar el captcha a 2Captcha
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        if (resp.data.status !== 1) throw new Error("Error al enviar a 2Captcha: " + resp.data.request);
        
        const requestId = resp.data.request;
        console.log(`⏳ Captcha enviado (ID: ${requestId}). Esperando solución...`);

        // Consultar cada 5 segundos si ya está resuelto
        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            
            if (check.data.status === 1) {
                console.log("✅ Captcha resuelto con éxito.");
                return check.data.request;
            }
            if (check.data.request !== 'CAPCHA_NOT_READY') {
                throw new Error("Error en 2Captcha: " + check.data.request);
            }
            console.log("... el experto sigue resolviendo ...");
        }
    } catch (error) {
        throw new Error("Fallo en resolución de Captcha: " + error.message);
    }
}

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 PROCESANDO CÉDULA: ${cedula} ---`);
        
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            ignoreDefaultArgs: ['--disable-extensions'],
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log("🔗 Entrando a la web de la Policía...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 1. Aceptar términos y condiciones
        await page.waitForSelector('#continuarBtn', { timeout: 10000 });
        await page.click('#continuarBtn');
        console.log("✅ Términos aceptados.");

        // 2. Llenar el formulario de cédula
        await page.waitForSelector('#form\\:cedulaInput', { timeout: 10000 });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1'); // '1' suele ser Cédula de Ciudadanía
        console.log("✍️ Datos ingresados.");

        // 3. Resolver el Captcha
        const gRecaptchaResponse = await resolverCaptcha(page);
        
        // 4. Inyectar el token de respuesta en el campo oculto
        await page.evaluate((token) => {
            document.getElementById('g-recaptcha-response').innerHTML = token;
        }, gRecaptchaResponse);

        // 5. Hacer clic en consultar
        await page.click('#form\\:consultarBtn');
        console.log("🖱️ Clic en Consultar.");

        // 6. Esperar y extraer resultado
        await page.waitForSelector('#form\\:panelResultado', { timeout: 20000 });
        const dataFinal = await page.evaluate(() => {
            return document.querySelector('#form\\:panelResultado').innerText;
        });

        console.log("📄 Resultado capturado correctamente.");
        await client.set(`resultado:${cedula}`, JSON.stringify({ cedula, resultado: dataFinal }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ ERROR: ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE LA TAREA: ${cedula} ---`);
    }
}

// Servidor de salud y escucha de Redis
const app = express();
app.get('/', (req, res) => res.send('Worker Bot Activo 🤖'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', async () => {
    try {
        await client.connect();
        console.log("🚀 WORKER CONECTADO A REDIS Y ESPERANDO TAREAS...");
        
        while (true) {
            const t = await client.brPop('cola_consultas', 0);
            if (t) {
                const item = JSON.parse(t.element);
                await ejecutarScraping(item.cedula || item);
                console.log('👀 Esperando nueva tarea...');
            }
        }
    } catch (err) {
        console.error("Error en el bucle del worker:", err);
    }
});
