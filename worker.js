const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Worker Multi-Fuente Activo`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

// --- MÓDULO INTERNACIONAL: INTERPOL ---
async function consultarInterpol(nombre, apellido) {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        console.log(`🌍 Consultando Interpol: ${nombre} ${apellido}`);
        await page.goto(`https://www.interpol.int/es/How-we-work/Notices/Red-Notices/View-Red-Notices#${apellido}&${nombre}`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 4000));
        const resultados = await page.evaluate(() => {
            const el = document.querySelector('.noticesList__count');
            return el ? parseInt(el.innerText) : 0;
        });
        return resultados > 0 ? `⚠️ ${resultados} COINCIDENCIAS` : "✅ LIMPIO";
    } catch (e) { return "ERROR_INTERPOL"; }
    finally { await browser.close(); }
}

// --- MÓDULO INTERNACIONAL: OFAC (LISTA CLINTON) ---
async function consultarOFAC(nombre, apellido) {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        console.log(`🇺🇸 Consultando OFAC (Lista Clinton): ${nombre} ${apellido}`);
        await page.goto('https://sanctionssearch.ofac.treas.gov/', { waitUntil: 'networkidle2' });
        await page.type('#ctl00_MainContent_txtLastName', `${apellido} ${nombre}`);
        await page.click('#ctl00_MainContent_btnSearch');
        await new Promise(r => setTimeout(r, 3000));
        const resultado = await page.evaluate(() => {
            const tabla = document.querySelector('#ctl00_MainContent_gvSearchResults');
            return tabla ? "⚠️ COINCIDENCIA DETECTADA" : "✅ LIMPIO";
        });
        return resultado;
    } catch (e) { return "ERROR_OFAC"; }
    finally { await browser.close(); }
}

// --- MÓDULO NACIONAL: POLICÍA (CON PROXY) ---
async function consultarPolicia(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`]
    });
    const page = await browser.newPage();
    await page.authenticate({ username: process.env.PROXY_USER, password: process.env.PROXY_PASS });
    try {
        console.log(`🇨🇴 Consultando Policía Nacional: ${cedula}`);
        // ... (Aquí va tu lógica de Policía con Captcha que ya teníamos)
        return "PROCESO_EXITOSO"; // Simplificado para el ejemplo
    } catch (e) { return "ERROR_POLICIA"; }
    finally { await browser.close(); }
}

// --- CICLO PRINCIPAL ---
async function iniciarWorker() {
    await client.connect();
    console.log('🤖 Sistema de Inteligencia Masiva esperando tareas...');
    
    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            const { cedula, nombre, apellido } = JSON.parse(tarea.element);
            console.log(`\n🔎 ESCANEO INICIADO: ${nombre} ${apellido} (${cedula})`);

            // Ejecutamos todo en paralelo para máxima velocidad
            const [interpol, ofac, policia] = await Promise.all([
                consultarInterpol(nombre, apellido),
                consultarOFAC(nombre, apellido),
                consultarPolicia(cedula)
            ]);

            console.log(`📊 REPORTE CONSOLIDADO:`);
            console.log(`- Interpol: ${interpol}`);
            console.log(`- OFAC (EE.UU): ${ofac}`);
            console.log(`- Policía COL: ${policia}`);
            console.log(`------------------------------------------`);
        }
    }
}

iniciarWorker();
