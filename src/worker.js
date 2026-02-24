const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

// --- ⚙️ CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';
const client = createClient({ url: REDIS_URL });

async function resolverCaptcha(page) {
    try {
        console.log("🧩 Obteniendo SiteKey para el Captcha...");
        const siteKey = await page.evaluate(() => {
            const el = document.querySelector('.g-recaptcha');
            return el ? el.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) throw new Error("No se encontró el SiteKey");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        const requestId = resp.data.request;
        console.log(`⏳ Resolviendo Captcha (ID: ${requestId})...`);

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

        // 📍 RUTA CONFIRMADA POR TU LOG DE CONSTRUCCIÓN
        const RUTA_CHROME = '/opt/render/project/src/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';

        console.log(`🔍 Verificando archivo en: ${RUTA_CHROME}`);
        if (!fs.existsSync(RUTA_CHROME)) {
            console.log("❌ ALERTA: El archivo no se detecta con fs.existsSync. Intentando lanzamiento de todos modos...");
        } else {
            console.log("✅ El archivo existe y es accesible.");
        }

        browser = await puppeteer.launch({
            executablePath: RUTA_CHROME,
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

        console.log("🔗 Navegando al portal de la Policía...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Interacción inicial
        await page.waitForSelector('#continuarBtn', { visible: true });
        await page.click('#continuarBtn');
        console.log("✔️ Botón continuar clickeado.");
        
        // Ingreso de datos
        await page.waitForSelector('#form\\:cedulaInput', { visible: true });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');
        console.log("✔️ Datos de cédula ingresados.");

        // Resolución de Captcha
        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            const el = document.getElementById('g-recaptcha-response');
            if (el) el.innerHTML = t;
        }, token);
        console.log("✔️ Token de Captcha inyectado.");

        // Envío y Resultado
        await page.click('#form\\:consultarBtn');
        console.log("🛰️ Esperando respuesta del panel...");
        
        await page.waitForSelector('#form\\:panelResultado', { timeout: 35000 });
        const resultado = await page.evaluate(() => document.querySelector('#form\\:panelResultado').innerText);

        console.log("📄 ¡ÉXITO! Datos recuperados satisfactoriamente.");
        await client.set(`resultado:${cedula}`, JSON.stringify({ 
            cedula, 
            resultado, 
            fecha: new Date().toISOString() 
        }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ ERROR EN EL PROCESO: ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ 
            error: e.message,
            paso: "scraping" 
        }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE TAREA: ${cedula} ---`);
    }
}

// Servidor Express para mantener vivo el servicio en Render
const app = express();
app.get('/', (req, res) => res.send('Worker Policia Activo 🤖'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', async () => {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 WORKER CONECTADO A REDIS Y LISTO PARA PROCESAR.");
        
        while (true) {
            // Escucha tareas de la cola de Redis
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const data = JSON.parse(tarea.element);
                await ejecutarScraping(data.cedula || data);
            }
        }
    } catch (err) {
        console.error("Error crítico en el bucle principal:", err);
    }
});
