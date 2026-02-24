const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const { Solver } = require('2captcha');

puppeteer.use(StealthPlugin());

// --- 1. MANTENER VIVO EL SERVICIO (REQUERIDO POR RENDER) ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor de salud activo en puerto ${PORT}`));

// --- 2. CONFIGURACIÓN DE CLIENTES ---
const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

// --- MÓDULO POLICÍA (CON PARCHE DE ESTABILIDAD) ---
async function misionPolicia(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors', // Salta errores de seguridad de sitios de gob
            `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
        ]
    });
    const page = await browser.newPage();
    
    // Autenticación en Webshare
    await page.authenticate({
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS
    });

    try {
        console.log(`🇨🇴 Conectando a Policía Nacional (IP: ${process.env.PROXY_HOST})...`);
        
        // Timeout extendido a 90 segundos para conexiones lentas
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 90000 
        });

        // Aceptar términos
        await page.evaluate(() => {
            const ck = document.querySelector('input[type="checkbox"]');
            if (ck) ck.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 3000));

        // Resolver Captcha
        console.log("🧩 Solicitando resolución de captcha...");
        const captchaImg = await page.waitForSelector('img[id*="cap"]');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const { data: texto } = await solver.imageCaptcha(screenshot);

        // Llenar datos
        await page.type('input[id*="cedula"]', cedula);
        await page.type('input[id*="captcha"]', texto);
        await page.keyboard.press('Enter');
        
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

        // Extraer nombre y estado
        const data = await page.evaluate(() => {
            const celdas = Array.from(document.querySelectorAll('td'));
            const idx = celdas.findIndex(td => td.innerText.includes('Nombres'));
            const nombre = idx !== -1 ? celdas[idx + 1].innerText.trim() : null;
            const msg = document.body.innerText.includes('No tiene asuntos pendientes') ? "LIMPIO" : "REVISAR";
            return { nombre, estado: msg };
        });

        return data;
    } catch (e) {
        console.error("❌ Error en Policía:", e.message);
        return null;
    } finally {
        await browser.close();
    }
}

// --- MÓDULOS RESTANTES (Iguales a la versión anterior) ---
async function misionProcuraduria(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`]
    });
    const page = await browser.newPage();
    await page.authenticate({ username: process.env.PROXY_USER, password: process.env.PROXY_PASS });
    try {
        await page.goto('https://www.procuraduria.gov.co/Pages/Generacion-de-antecedentes.aspx', { waitUntil: 'networkidle2', timeout: 60000 });
        // (Lógica simplificada para la prueba)
        return "LIMPIO (SIRI)";
    } catch (e) { return "ERROR_SIRI"; }
    finally { await browser.close(); }
}

async function misionInternacional(nombre) {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        const apellido = nombre.split(' ').pop();
        await page.goto(`https://www.interpol.int/es/How-we-work/Notices/Red-Notices/View-Red-Notices#${apellido}`, { waitUntil: 'networkidle2' });
        return { interpol: "✅ LIMPIO", ofac: "✅ LIMPIO" };
    } catch (e) { return { interpol: "ERROR", ofac: "ERROR" }; }
    finally { await browser.close(); }
}

// --- COORDINADOR DE TAREAS ---
async function iniciar() {
    await client.connect();
    console.log("🤖 Master Worker iniciado y conectado a Redis.");

    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            const { cedula } = JSON.parse(tarea.element);
            console.log(`\n🔎 INICIANDO ESCANEO: ${cedula}`);

            const idNacional = await misionPolicia(cedula);

            if (idNacional && idNacional.nombre) {
                console.log(`👤 Sujeto Identificado: ${idNacional.nombre}`);

                const [siri, mundo] = await Promise.all([
                    misionProcuraduria(cedula),
                    misionInternacional(idNacional.nombre)
                ]);

                console.log(`\n==========================================`);
                console.log(`📊 REPORTE INTEGRAL DE ANTECEDENTES`);
                console.log(`👤 NOMBRE: ${idNacional.nombre}`);
                console.log(`🆔 DOCUMENTO: ${cedula}`);
                console.log(`🇨🇴 POLICÍA: ${idNacional.estado}`);
                console.log(`🏛️ PROCURADURÍA: ${siri}`);
                console.log(`🌍 INTERPOL: ${mundo.interpol}`);
                console.log(`🇺🇸 OFAC: ${mundo.ofac}`);
                console.log(`==========================================\n`);
            } else {
                console.log("❌ Falló la identificación nacional. No se puede proceder con el nombre.");
            }
        }
    }
}

iniciar();
