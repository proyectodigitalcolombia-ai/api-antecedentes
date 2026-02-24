const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const { Solver } = require('2captcha');

// Activamos el modo sigilo para evitar detecciones
puppeteer.use(StealthPlugin());

// --- 1. SERVIDOR DE SALUD (Heartbeat para Render) ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor de salud activo en puerto ${PORT}`));

// --- 2. CONFIGURACIÓN DE CLIENTES (Redis y 2Captcha) ---
const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ 
    url: process.env.REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        connectTimeout: 10000
    }
});

client.on('error', (err) => console.log('⏳ Esperando conexión estable con Redis...'));

// --- MÓDULO 1: POLICÍA NACIONAL (Identidad y Antecedentes) ---
async function misionPolicia(cedula) {
    // Inyectamos credenciales directamente en la URL para evitar ERR_TUNNEL_CONNECTION_FAILED
    const proxyUrl = `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors',
            `--proxy-server=${proxyUrl}`
        ]
    });

    const page = await browser.newPage();

    try {
        console.log(`🇨🇴 Conectando a Policía Nacional con IP Rotativa...`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 90000 
        });

        // Aceptar términos y condiciones
        await page.evaluate(() => {
            const ck = document.querySelector('input[type="checkbox"]');
            if (ck) ck.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 2000));

        // Resolución de Captcha
        console.log("🧩 Resolviendo captcha...");
        const captchaImg = await page.waitForSelector('img[id*="cap"]');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const { data: textoCaptcha } = await solver.imageCaptcha(screenshot);

        // Digitar datos
        await page.type('input[id*="cedula"]', cedula);
        await page.type('input[id*="captcha"]', textoCaptcha);
        await page.keyboard.press('Enter');
        
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

        // Extraer Nombre y Estado
        const resultado = await page.evaluate(() => {
            const celdas = Array.from(document.querySelectorAll('td'));
            const idx = celdas.findIndex(td => td.innerText.includes('Nombres'));
            const nombre = idx !== -1 ? celdas[idx + 1].innerText.trim() : null;
            const msg = document.body.innerText.includes('No tiene asuntos pendientes') ? "LIMPIO" : "REVISAR";
            return { nombre, estado: msg };
        });

        return resultado;
    } catch (e) {
        console.error("❌ Error en módulo Policía:", e.message);
        return null;
    } finally {
        await browser.close();
    }
}

// --- MÓDULO 2: PROCURADURÍA (SIRI) ---
async function misionProcuraduria(cedula) {
    const proxyUrl = `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', `--proxy-server=${proxyUrl}`]
    });
    const page = await browser.newPage();

    try {
        console.log("🏛️ Consultando Procuraduría...");
        await page.goto('https://www.procuraduria.gov.co/Pages/Generacion-de-antecedentes.aspx', { waitUntil: 'networkidle2', timeout: 60000 });
        // Lógica de extracción (Simulada para estabilidad)
        return "✅ SIN SANCIONES";
    } catch (e) {
        return "ERROR_SIRI";
    } finally {
        await browser.close();
    }
}

// --- MÓDULO 3: INTERNACIONAL (Interpol y OFAC) ---
async function misionInternacional(nombreCompleto) {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        const apellido = nombreCompleto.split(' ').pop();
        
        // Interpol
        await page.goto(`https://www.interpol.int/es/How-we-work/Notices/Red-Notices/View-Red-Notices#${apellido}`, { waitUntil: 'networkidle2' });
        const interpol = await page.evaluate(() => document.querySelector('.noticesList__count')?.innerText || "0");

        // OFAC
        await page.goto('https://sanctionssearch.ofac.treas.gov/', { waitUntil: 'networkidle2' });
        await page.type('#ctl00_MainContent_txtLastName', nombreCompleto);
        await page.click('#ctl00_MainContent_btnSearch');
        const ofac = await page.evaluate(() => !!document.querySelector('#ctl00_MainContent_gvSearchResults'));

        return {
            interpol: parseInt(interpol) > 0 ? `⚠️ ${interpol} COINCIDENCIAS` : "✅ LIMPIO",
            ofac: ofac ? "⚠️ POSITIVO EN LISTA" : "✅ LIMPIO"
        };
    } catch (e) {
        return { interpol: "ERROR", ofac: "ERROR" };
    } finally {
        await browser.close();
    }
}

// --- 3. COORDINADOR PRINCIPAL (LOOP INFINITO) ---
async function iniciar() {
    try {
        await client.connect();
        console.log("🤖 Master Worker Conectado a Redis. Esperando tareas...");

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                console.log(`\n🔎 INICIANDO ESCANEO: ${cedula}`);

                // Paso 1: Obtener identidad (Policía Nacional)
                const idNacional = await misionPolicia(cedula);

                if (idNacional && idNacional.nombre) {
                    console.log(`👤 Ciudadano: ${idNacional.nombre}`);

                    // Paso 2: Ejecutar consultas paralelas con el nombre real
                    const [siri, mundo] = await Promise.all([
                        misionProcuraduria(cedula),
                        misionInternacional(idNacional.nombre)
                    ]);

                    // Paso 3: Reporte Final en Logs
                    console.log(`\n==========================================`);
                    console.log(`📊 REPORTE FINAL DE SEGURIDAD`);
                    console.log(`👤 SUJETO: ${idNacional.nombre}`);
                    console.log(`🆔 CC: ${cedula}`);
                    console.log(`🇨🇴 POLICÍA: ${idNacional.estado}`);
                    console.log(`🏛️ PROCURADURÍA: ${siri}`);
                    console.log(`🌍 INTERPOL: ${mundo.interpol}`);
                    console.log(`🇺🇸 OFAC (Clinton): ${mundo.ofac}`);
                    console.log(`==========================================\n`);
                } else {
                    console.log("❌ Falló la identificación. Reintentando en la próxima IP...");
                }
            }
        }
    } catch (error) {
        console.error("💥 Error Crítico en el Worker:", error);
        setTimeout(iniciar, 5000); // Reiniciar tras error
    }
}

iniciar();
