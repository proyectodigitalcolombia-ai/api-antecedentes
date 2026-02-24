const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const { Solver } = require('2captcha');

// Activamos el modo sigilo para no ser detectados
puppeteer.use(StealthPlugin());

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

// --- MÓDULO 1: POLICÍA (Obtener Nombre y Antecedentes Nacionales) ---
async function misionNacional(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
        ]
    });
    const page = await browser.newPage();

    // Autenticación en Webshare (usando tus datos lzwsgumc-1...)
    await page.authenticate({
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS
    });

    try {
        console.log(`🇨🇴 Navegando a Policía Nacional con Proxy Colombia...`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 1. Aceptar términos y condiciones
        await page.evaluate(() => {
            const check = document.querySelector('input[type="checkbox"]');
            if (check) check.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 2000));

        // 2. Captura y resolución de Captcha
        const captchaImg = await page.waitForSelector('img[id*="cap"]');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        console.log("🧩 Resolviendo captcha con 2Captcha...");
        const { data: captchaTexto } = await solver.imageCaptcha(screenshot);

        // 3. Digitar Cédula y Captcha
        await page.type('input[id*="cedula"]', cedula);
        await page.type('input[id*="captcha"]', captchaTexto);
        await page.keyboard.press('Enter');
        
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // 4. Extraer el nombre real y el estado
        const resultado = await page.evaluate(() => {
            const celdas = Array.from(document.querySelectorAll('td'));
            const indexNombre = celdas.findIndex(td => td.innerText.includes('Nombres'));
            const nombreCompleto = indexNombre !== -1 ? celdas[indexNombre + 1].innerText.trim() : null;
            const msg = document.body.innerText.includes('No tiene asuntos pendientes') ? "LIMPIO" : "REVISAR";
            return { nombre: nombreCompleto, estado: msg };
        });

        return resultado;
    } catch (e) {
        console.error("❌ Error en misión nacional:", e.message);
        return null;
    } finally {
        await browser.close();
    }
}

// --- MÓDULO 2: INTERNACIONAL (Interpol y OFAC) ---
// Estas no necesitan proxy, usan la IP de Render para mayor velocidad
async function misionInternacional(nombre) {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        const apellido = nombre.split(' ').pop();
        
        // Consultar Interpol
        await page.goto(`https://www.interpol.int/es/How-we-work/Notices/Red-Notices/View-Red-Notices#${apellido}`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 3000));
        const interpolCount = await page.evaluate(() => document.querySelector('.noticesList__count')?.innerText || "0");

        // Consultar OFAC
        await page.goto('https://sanctionssearch.ofac.treas.gov/', { waitUntil: 'networkidle2' });
        await page.type('#ctl00_MainContent_txtLastName', nombre);
        await page.click('#ctl00_MainContent_btnSearch');
        await new Promise(r => setTimeout(r, 2000));
        const ofacHallazgo = await page.evaluate(() => !!document.querySelector('#ctl00_MainContent_gvSearchResults'));

        return {
            interpol: parseInt(interpolCount) > 0 ? `⚠️ ${interpolCount} ALERTAS` : "✅ LIMPIO",
            ofac: ofacHallazgo ? "⚠️ ENCONTRADO EN LISTA" : "✅ LIMPIO"
        };
    } catch (e) {
        return { interpol: "ERROR", ofac: "ERROR" };
    } finally {
        await browser.close();
    }
}

// --- COORDINADOR DE TAREAS ---
async function start() {
    await client.connect();
    console.log("🤖 Worker listo. Esperando cédulas en la cola...");

    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            const { cedula } = JSON.parse(tarea.element);
            console.log(`\n🔎 Procesando ID: ${cedula}`);

            // Paso 1: Ir a la Policía por el nombre
            const idNacional = await misionNacional(cedula);

            if (idNacional && idNacional.nombre) {
                console.log(`👤 Ciudadano identificado: ${idNacional.nombre}`);

                // Paso 2: Usar ese nombre para las bases mundiales
                const resultadosMundo = await misionInternacional(idNacional.nombre);

                console.log(`\n==========================================`);
                console.log(`📊 REPORTE FINAL PARA: ${idNacional.nombre}`);
                console.log(`🆔 DOCUMENTO: ${cedula}`);
                console.log(`🇨🇴 POLICÍA: ${idNacional.estado}`);
                console.log(`🌍 INTERPOL: ${resultadosMundo.interpol}`);
                console.log(`🇺🇸 OFAC: ${resultadosMundo.ofac}`);
                console.log(`==========================================\n`);
            } else {
                console.log(`❌ No se pudo extraer información para la cédula ${cedula}`);
            }
        }
    }
}

start();
