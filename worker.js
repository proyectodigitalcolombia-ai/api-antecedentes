const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const { Solver } = require('2captcha');

puppeteer.use(StealthPlugin());

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

// --- FUENTE 1: POLICÍA (Descubre el nombre) ---
async function obtenerNombreYPolicia(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`]
    });
    const page = await browser.newPage();
    try {
        await page.authenticate({ username: process.env.PROXY_USER, password: process.env.PROXY_PASS });
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { waitUntil: 'networkidle2' });
        
        // --- Lógica de Aceptar Términos ---
        await page.evaluate(() => {
            const ck = document.querySelector('input[type="checkbox"]');
            if (ck) ck.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 2000));

        // --- Captcha y Cédula ---
        const captchaImg = await page.waitForSelector('img[id*="cap"]');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const { data: captchaTexto } = await solver.imageCaptcha(screenshot);

        await page.type('input[id*="cedula"]', cedula);
        await page.type('input[id*="captcha"]', captchaTexto);
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // --- EXTRACCIÓN DEL NOMBRE ---
        const nombreExtraido = await page.evaluate(() => {
            const celdas = Array.from(document.querySelectorAll('td'));
            // Buscamos la celda que suele seguir a "Nombres:"
            const index = celdas.findIndex(td => td.innerText.includes('Nombres'));
            return index !== -1 ? celdas[index + 1].innerText.trim() : null;
        });

        const tieneAntecedentes = await page.evaluate(() => document.body.innerText.includes('No tiene asuntos pendientes'));

        return { 
            nombre: nombreExtraido, 
            resultado: tieneAntecedentes ? "LIBPIO (COL)" : "REVISAR ANTECEDENTES (COL)" 
        };
    } catch (e) {
        console.error("❌ Error en Policía:", e.message);
        return null;
    } finally {
        await browser.close();
    }
}

// --- FUENTE 2: INTERPOL ---
async function consultarInterpol(nombre) {
    if (!nombre) return "N/A";
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        // Interpol usa apellidos y nombres separados, intentamos una búsqueda general
        const apellido = nombre.split(' ').pop();
        await page.goto(`https://www.interpol.int/es/How-we-work/Notices/Red-Notices/View-Red-Notices#${apellido}`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 3000));
        const count = await page.evaluate(() => document.querySelector('.noticesList__count')?.innerText || "0");
        return parseInt(count) > 0 ? `⚠️ ${count} COINCIDENCIAS` : "✅ LIMPIO";
    } catch (e) { return "ERROR_INTERPOL"; }
    finally { await browser.close(); }
}

// --- FUENTE 3: OFAC (LISTA CLINTON) ---
async function consultarOFAC(nombre) {
    if (!nombre) return "N/A";
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.goto('https://sanctionssearch.ofac.treas.gov/', { waitUntil: 'networkidle2' });
        await page.type('#ctl00_MainContent_txtLastName', nombre);
        await page.click('#ctl00_MainContent_btnSearch');
        await new Promise(r => setTimeout(r, 2000));
        const hallazgo = await page.evaluate(() => !!document.querySelector('#ctl00_MainContent_gvSearchResults'));
        return hallazgo ? "⚠️ POSITIVO" : "✅ LIMPIO";
    } catch (e) { return "ERROR_OFAC"; }
    finally { await browser.close(); }
}

// --- PROCESADOR CENTRAL ---
async function procesar() {
    await client.connect();
    console.log("🤖 Worker Inteligente Iniciado...");

    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            const { cedula } = JSON.parse(tarea.element);
            
            // 1. OBTENER IDENTIDAD
            const infoNacional = await obtenerNombreYPolicia(cedula);

            if (infoNacional && infoNacional.nombre) {
                console.log(`👤 Ciudadano identificado: ${infoNacional.nombre}`);

                // 2. LANZAR INTERNACIONALES CON EL NOMBRE REAL
                const [resInterpol, resOFAC] = await Promise.all([
                    consultarInterpol(infoNacional.nombre),
                    consultarOFAC(infoNacional.nombre)
                ]);

                console.log(`\n==========================================`);
                console.log(`📊 REPORTE FINAL PARA: ${infoNacional.nombre}`);
                console.log(`🆔 Cédula: ${cedula}`);
                console.log(`🇨🇴 Policía: ${infoNacional.resultado}`);
                console.log(`🌍 Interpol: ${resInterpol}`);
                console.log(`🇺🇸 OFAC: ${resOFAC}`);
                console.log(`==========================================\n`);
            } else {
                console.log(`❌ No se pudo identificar a la cédula ${cedula}`);
            }
        }
    }
}

procesar();
