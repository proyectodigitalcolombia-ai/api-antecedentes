const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Worker Agregador Activo`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

// --- MISIONES INTERNACIONALES (IP RENDER) ---

async function consultarInterpol(nombre, apellido) {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.goto(`https://www.interpol.int/es/How-we-work/Notices/Red-Notices/View-Red-Notices#${apellido}&${nombre}`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 4000));
        const count = await page.evaluate(() => {
            const el = document.querySelector('.noticesList__count');
            return el ? parseInt(el.innerText) : 0;
        });
        return count > 0 ? `⚠️ ${count} COINCIDENCIAS` : "✅ LIMPIO";
    } catch (e) { return "ERROR_INTERPOL"; }
    finally { await browser.close(); }
}

async function consultarOFAC(nombre, apellido) {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.goto('https://sanctionssearch.ofac.treas.gov/', { waitUntil: 'networkidle2' });
        await page.type('#ctl00_MainContent_txtLastName', `${apellido} ${nombre}`);
        await page.click('#ctl00_MainContent_btnSearch');
        await new Promise(r => setTimeout(r, 3000));
        const hallazgo = await page.evaluate(() => !!document.querySelector('#ctl00_MainContent_gvSearchResults'));
        return hallazgo ? "⚠️ POSITIVO (LISTA CLINTON)" : "✅ LIMPIO";
    } catch (e) { return "ERROR_OFAC"; }
    finally { await browser.close(); }
}

// --- MISIÓN NACIONAL (PROXY COLOMBIA) ---

async function consultarPolicia(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`]
    });
    const page = await browser.newPage();
    try {
        await page.authenticate({ username: process.env.PROXY_USER, password: process.env.PROXY_PASS });
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { waitUntil: 'networkidle2', timeout: 40000 });
        
        // Aquí aplicas el código de aceptar términos y captcha que ya pulimos
        // Por ahora simulamos la respuesta para probar la integración
        return "CONSULTA EN PROCESO";
    } catch (e) { return "ERROR_PROXY_POLICIA"; }
    finally { await browser.close(); }
}

// --- COORDINADOR ---

async function iniciarBot() {
    await client.connect();
    console.log('🤖 Sistema de Inteligencia Masiva listo...');

    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            const { cedula, nombre, apellido } = JSON.parse(tarea.element);
            console.log(`\n🔎 ESCANEANDO A: ${nombre} ${apellido} (${cedula})`);

            // Ejecución Paralela: Las 3 al mismo tiempo
            const [resInterpol, resOFAC, resPolicia] = await Promise.all([
                consultarInterpol(nombre, apellido),
                consultarOFAC(nombre, apellido),
                consultarPolicia(cedula)
            ]);

            console.log(`------------------------------------------`);
            console.log(`📊 REPORTE DE ANTECEDENTES:`);
            console.log(`- Interpol: ${resInterpol}`);
            console.log(`- OFAC (USA): ${resOFAC}`);
            console.log(`- Policía COL: ${resPolicia}`);
            console.log(`------------------------------------------`);
        }
    }
}

iniciarBot();
