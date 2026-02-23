const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

// --- 🛠️ CONFIGURACIÓN DE RUTAS CRÍTICAS ---
// Forzamos la ruta donde Render instaló Chrome exitosamente
const RUTA_CHROME = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';

const client = createClient({ url: REDIS_URL });

/**
 * Función para resolver el captcha usando 2Captcha
 */
async function resolverCaptcha(page) {
    try {
        console.log("🧩 Obteniendo SiteKey para Captcha...");
        const siteKey = await page.evaluate(() => {
            const element = document.querySelector('.g-recaptcha');
            return element ? element.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) throw new Error("No se encontró SiteKey en la página");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        const requestId = resp.data.request;
        console.log(`⏳ Esperando resolución de captcha (ID: ${requestId})...`);

        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) return check.data.request;
            if (check.data.request !== 'CAPCHA_NOT_READY') throw new Error(check.data.request);
        }
    } catch (e) {
        throw new Error("Fallo en proceso de Captcha: " + e.message);
    }
}

/**
 * Proceso principal de Scraping 🤖
 */
async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO NUEVA CONSULTA: ${cedula} ---`);

        // 🔎 DIAGNÓSTICO: Verificar si el archivo realmente está ahí antes de intentar abrirlo
        if (fs.existsSync(RUTA_CHROME)) {
            console.log(`✅ ¡ÉXITO! Binario de Chrome detectado en: ${RUTA_CHROME}`);
        } else {
            console.error(`⚠️ ATENCIÓN: No se encuentra el archivo en la ruta esperada.`);
            // Listar qué hay en la carpeta de caché para debuggear
            const dirContenido = fs.readdirSync('/opt/render/.cache/puppeteer');
            console.log(`Contenido de la carpeta cache: ${dirContenido.join(', ')}`);
        }

        browser = await puppeteer.launch({
            executablePath: RUTA_CHROME, // <--- AQUÍ FORZAMOS EL MOTOR
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log("🔗 Navegando a la página de la Policía...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 1. Aceptar términos
        await page.waitForSelector('#continuarBtn', { visible: true });
        await page.click('#continuarBtn');
        console.log("✔️ Términos aceptados.");
        
        // 2. Ingresar Cédula
        await page.waitForSelector('#form\\:cedulaInput', { visible: true });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');

        // 3. Resolver Captcha
        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            const el = document.getElementById('g-recaptcha-response');
            if (el) el.innerHTML = t;
        }, token);
        console.log("✔️ Token de captcha aplicado.");

        // 4. Consultar
        await page.click('#form\\:consultarBtn');
        console.log("🛰️ Consultando resultados...");
        
        await page.waitForSelector('#form\\:panelResultado', { timeout: 30000 });
        const resultado = await page.evaluate(() => document.querySelector('#form\\:panelResultado').innerText);

        console.log("📄 Resultado capturado correctamente.");
        await client.set(`resultado:${cedula}`, JSON.stringify({ 
            cedula, 
            resultado, 
            fecha: new Date().toISOString() 
        }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ ERROR EN EL PROCESO (${cedula}): ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ 
            error: e.message,
            timestamp: new Date().toISOString()
        }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE LA TAREA: ${cedula} ---`);
    }
}

// --- SERVIDOR Y BUCLE DE TAREAS ---
const app = express();
app.get('/', (req, res) => res.send('Worker está vivo... 🤖'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', async () => {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 CONECTADO A REDIS. ESCUCHANDO TAREAS...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const data = JSON.parse(tarea.element);
                const cedulaConsultar = data.cedula || data;
                await ejecutarScraping(cedulaConsultar);
            }
        }
    } catch (err) {
        console.error("🔴 Error crítico:", err);
    }
});
