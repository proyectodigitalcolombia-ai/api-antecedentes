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

// --- 1. FUNCIÓN INTERPOL (Internacional - IP Directa) ---
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

// --- 2. FUNCIÓN OFAC / LISTA CLINTON (Internacional - IP Directa) ---
async function consultarOFAC(nombre, apellido) {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        console.log(`🇺🇸 Consultando OFAC: ${nombre} ${apellido}`);
        await page.goto('https://sanctionssearch.ofac.treas.gov/', { waitUntil: 'networkidle2' });
        await page.type('#ctl00_MainContent_txtLastName', `${apellido} ${nombre}`);
        await page.click('#ctl00_MainContent_btnSearch');
        await new Promise(r => setTimeout(r, 3000));
        const tieneCoincidencias = await page.evaluate(() => !!document.querySelector('#ctl00_MainContent_gvSearchResults'));
        return tieneCoincidencias ? "⚠️ COINCIDENCIA DETECTADA" : "✅ LIMPIO";
    } catch (e) { return "ERROR_OFAC"; }
    finally { await browser.close(); }
}

// --- 3. FUNCIÓN POLICÍA (Nacional - REQUIERE PROXY COLOMBIA) ---
async function consultarPolicia(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`]
    });
    const page = await browser.newPage();
    try {
        await page.authenticate({ username: process.env.PROXY_USER, password: process.env.PROXY_PASS });
        console.log(`🇨🇴 Consultando Policía COL: ${cedula}`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { waitUntil: 'networkidle2', timeout: 40000 });
        
        // (Aquí va la lógica de aceptar términos y captcha que ya conoces)
        // Por ahora retornamos un placeholder para probar el flujo masivo
        return "CONSULTA_ENVIADA";
    } catch (e) { return "ERROR_POLICIA (IP Bloqueada)"; }
    finally { await browser.close(); }
}

// --- LÓGICA DE COORDINACIÓN ---
async function iniciarSistema() {
    await client.connect();
    console.log('🤖 Escáner de Inteligencia iniciado. Esperando tarea...');

    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            const { cedula, nombre, apellido } = JSON.parse(tarea.element);
            console.log(`\n🔎 INICIANDO REPORTE MASIVO PARA: ${nombre} ${apellido}`);

            // Lanzamos las 3 misiones al mismo tiempo (Paralelismo)
            const [interpol, ofac, policia] = await Promise.all([
                consultarInterpol(nombre, apellido),
                consultarOFAC(nombre, apellido),
                consultarPolicia(cedula)
            ]);

            console.log(`------------------------------------------`);
            console.log(`📊 REPORTE CONSOLIDADO:`);
            console.log(`- Interpol: ${interpol}`);
            console.log(`- OFAC (USA): ${ofac}`);
            console.log(`- Policía (COL): ${policia}`);
            console.log(`------------------------------------------`);
        }
    }
}

iniciarSistema();
