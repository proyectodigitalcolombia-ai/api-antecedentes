const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- ⚙️ CONFIGURACIÓN DE RUTAS ---
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';

// Definimos la ruta donde REALMENTE queremos que esté
const RUTA_CORRECTA = '/opt/render/.cache/puppeteer';
const RUTA_ERROR = '/opt/render/project/src/.cache/puppetee';

const client = createClient({ url: REDIS_URL });

/**
 * LIMPIEZA PREVENTIVA 🧹
 * Borra la carpeta mal escrita si llega a existir para que no confunda a Puppeteer
 */
if (fs.existsSync(RUTA_ERROR)) {
    console.log("⚠️ Detectada carpeta con error de ortografía. Eliminando...");
    fs.rmSync(RUTA_ERROR, { recursive: true, force: true });
}

/**
 * BUSCADOR DINÁMICO 🔍
 * Encuentra el ejecutable 'chrome' dentro de la ruta correcta
 */
function encontrarChrome() {
    try {
        if (!fs.existsSync(RUTA_CORRECTA)) return null;
        
        const buscarRecurvico = (dir) => {
            const archivos = fs.readdirSync(dir);
            for (const archivo of archivos) {
                const rutaFull = path.join(dir, archivo);
                if (fs.statSync(rutaFull).isDirectory()) {
                    const found = buscarRecurvico(rutaFull);
                    if (found) return found;
                } else if (archivo === 'chrome' && rutaFull.includes('chrome-linux64')) {
                    return rutaFull;
                }
            }
            return null;
        };
        return buscarRecurvico(RUTA_CORRECTA);
    } catch (e) {
        return null;
    }
}

async function resolverCaptcha(page) {
    try {
        console.log("🧩 Solicitando resolución de Captcha...");
        const siteKey = await page.evaluate(() => {
            const el = document.querySelector('.g-recaptcha');
            return el ? el.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) throw new Error("No se halló SiteKey");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        const requestId = resp.data.request;
        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) return check.data.request;
            if (check.data.request !== 'CAPCHA_NOT_READY') throw new Error(check.data.request);
        }
    } catch (e) {
        throw new Error("Error en Captcha: " + e.message);
    }
}

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA: ${cedula} ---`);

        const pathChrome = encontrarChrome();
        
        if (pathChrome) {
            console.log(`✅ Chrome encontrado en: ${pathChrome}`);
        } else {
            console.log("❌ No se encontró Chrome en la ruta correcta. Intentando lanzamiento por defecto...");
        }

        browser = await puppeteer.launch({
            executablePath: pathChrome || undefined, // Si lo encuentra, lo usa. Si no, confía en el sistema.
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

        console.log("🔗 Abriendo portal de la Policía...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Interacción con la página
        await page.waitForSelector('#continuarBtn', { visible: true });
        await page.click('#continuarBtn');
        
        await page.waitForSelector('#form\\:cedulaInput', { visible: true });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');

        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            const el = document.getElementById('g-recaptcha-response');
            if (el) el.innerHTML = t;
        }, token);

        await page.click('#form\\:consultarBtn');
        console.log("🛰️ Extrayendo información...");
        
        await page.waitForSelector('#form\\:panelResultado', { timeout: 30000 });
        const resultado = await page.evaluate(() => document.querySelector('#form\\:panelResultado').innerText);

        console.log("📄 ¡Consulta exitosa!");
        await client.set(`resultado:${cedula}`, JSON.stringify({ 
            cedula, 
            resultado, 
            fecha: new Date().toISOString() 
        }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ ERROR CRÍTICO: ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE TAREA: ${cedula} ---`);
    }
}

// --- SERVIDOR ---
const app = express();
app.get('/', (req, res) => res.send('Worker Operativo 🤖'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', async () => {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 WORKER CONECTADO A REDIS Y LISTO.");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const data = JSON.parse(tarea.element);
                await ejecutarScraping(data.cedula || data);
            }
        }
    } catch (err) {
        console.error("Error en bucle:", err);
    }
});
