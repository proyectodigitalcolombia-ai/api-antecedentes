const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

// --- CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';

// 🛡️ RUTA MANUAL: Confirmamos que tenga la "r" al final de puppeteer
const RUTA_CHROME = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';

const client = createClient({ url: REDIS_URL });

async function resolverCaptcha(page) {
    // ... (lógica de captcha se mantiene igual)
}

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA: ${cedula} ---`);

        // 🔍 DIAGNÓSTICO DE RUTA
        console.log(`🔎 Verificando existencia de Chrome en: ${RUTA_CHROME}`);
        if (fs.existsSync(RUTA_CHROME)) {
            console.log("✅ ¡El archivo de Chrome existe en la ruta especificada!");
        } else {
            console.log("❌ ERROR: El archivo NO existe ahí.");
            // Intentamos ver qué hay en la carpeta de nivel superior para rastrear el error
            try {
                const carpetasBase = fs.readdirSync('/opt/render/.cache/puppeteer');
                console.log(`📁 Contenido real de la caché: ${carpetasBase.join(', ')}`);
            } catch (err) {
                console.log("⚠️ No se pudo leer la carpeta /opt/render/.cache/puppeteer");
            }
        }

        // 🚀 LANZAMIENTO
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
        // ... (resto del proceso de scraping)
        
        console.log("📄 Resultado obtenido con éxito.");
        await client.set(`resultado:${cedula}`, JSON.stringify({ cedula, resultado: "Éxito", fecha: new Date() }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ FALLO CRÍTICO: ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE LA TAREA: ${cedula} ---`);
    }
}

// --- SERVIDOR Y ESCUCHA ---
const app = express();
app.get('/', (req, res) => res.send('Worker con diagnóstico activo 🛠️'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', async () => {
    if (!client.isOpen) await client.connect();
    console.log("🚀 ESCUCHANDO TAREAS...");
    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            const data = JSON.parse(tarea.element);
            await ejecutarScraping(data.cedula || data);
        }
    }
});
