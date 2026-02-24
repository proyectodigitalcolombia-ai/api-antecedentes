const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const { Solver } = require('2captcha');

puppeteer.use(StealthPlugin());

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

// --- MÓDULO 1: POLICÍA (Identidad + Antecedentes) ---
async function misionPolicia(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`]
    });
    const page = await browser.newPage();
    await page.authenticate({ username: process.env.PROXY_USER, password: process.env.PROXY_PASS });

    try {
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { waitUntil: 'networkidle2', timeout: 60000 });
        
        await page.evaluate(() => {
            const ck = document.querySelector('input[type="checkbox"]');
            if (ck) ck.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 2000));

        const captchaImg = await page.waitForSelector('img[id*="cap"]');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const { data: texto } = await solver.imageCaptcha(screenshot);

        await page.type('input[id*="cedula"]', cedula);
        await page.type('input[id*="captcha"]', texto);
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        return await page.evaluate(() => {
            const celdas = Array.from(document.querySelectorAll('td'));
            const idx = celdas.findIndex(td => td.innerText.includes('Nombres'));
            const nombre = idx !== -1 ? celdas[idx + 1].innerText.trim() : null;
            const estado = document.body.innerText.includes('No tiene asuntos pendientes') ? "LIMPIO" : "REVISAR";
            return { nombre, estado };
        });
    } catch (e) { return null; }
    finally { await browser.close(); }
}

// --- MÓDULO 2: PROCURADURÍA (SIRI) ---
async function misionProcuraduria(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`]
    });
    const page = await browser.newPage();
    await page.authenticate({ username: process.env.PROXY_USER, password: process.env.PROXY_PASS });

    try {
        console.log("🏛️ Consultando Procuraduría (SIRI)...");
        await page.goto('https://www.procuraduria.gov.co/Pages/Generacion-de-antecedentes.aspx', { waitUntil: 'networkidle2' });
        
        // La Procuraduría suele pedir tipo de documento y número
        await page.select('select[id*="ddlTipoID"]', '1'); // 1 suele ser Cédula de Ciudadanía
        await page.type('input[id*="txtID"]', cedula);
        
        // Resolución de Captcha de la Procuraduría (pregunta matemática o imagen)
        // Nota: Si es pregunta matemática, se extrae el texto y se resuelve con eval()
        const pregunta = await page.evaluate(() => document.querySelector('.captcha-question')?.innerText);
        if(pregunta) {
            // Lógica simple para resolver "cuanto es 5 + 3"
            const resultado = eval(pregunta.replace('=', '').replace('?', ''));
            await page.type('input[id*="answer"]', resultado.toString());
        }

        await page.click('button[id*="btnConsultar"]');
        await new Promise(r => setTimeout(r, 3000));

        const tieneSanciones = await page.evaluate(() => document.body.innerText.includes('No registra sanciones'));
        return tieneSanciones ? "LIMPIO" : "⚠️ POSEE REGISTROS";
    } catch (e) { return "ERROR_SIRI"; }
    finally { await browser.close(); }
}

// --- MÓDULO 3: INTERNACIONAL (Interpol y OFAC) ---
async function misionInternacional(nombre) {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        const apellido = nombre.split(' ').pop();
        await page.goto(`https://www.interpol.int/es/How-we-work/Notices/Red-Notices/View-Red-Notices#${apellido}`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 2000));
        const interpol = await page.evaluate(() => document.querySelector('.noticesList__count')?.innerText || "0");

        await page.goto('https://sanctionssearch.ofac.treas.gov/', { waitUntil: 'networkidle2' });
        await page.type('#ctl00_MainContent_txtLastName', nombre);
        await page.click('#ctl00_MainContent_btnSearch');
        const ofac = await page.evaluate(() => !!document.querySelector('#ctl00_MainContent_gvSearchResults'));

        return { 
            interpol: parseInt(interpol) > 0 ? `⚠️ ${interpol} ALERTAS` : "✅ LIMPIO", 
            ofac: ofac ? "⚠️ POSITIVO" : "✅ LIMPIO" 
        };
    } catch (e) { return { interpol: "ERROR", ofac: "ERROR" }; }
    finally { await browser.close(); }
}

// --- COORDINADOR ---
async function start() {
    await client.connect();
    console.log("🤖 Master Worker iniciado con Siriest + Procuraduría + Internacional...");

    while (true) {
        const tarea = await client.brPop('cola_consultas', 0);
        if (tarea) {
            const { cedula } = JSON.parse(tarea.element);
            
            // Paso 1: Obtener identidad (Policía)
            const idNacional = await misionPolicia(cedula);

            if (idNacional && idNacional.nombre) {
                console.log(`👤 Procesando a: ${idNacional.nombre}`);

                // Paso 2: Ejecutar el resto en paralelo
                const [siri, mundo] = await Promise.all([
                    misionProcuraduria(cedula),
                    misionInternacional(idNacional.nombre)
                ]);

                console.log(`\n==========================================`);
                console.log(`📊 REPORTE INTEGRAL: ${idNacional.nombre}`);
                console.log(`🆔 CC: ${cedula}`);
                console.log(`🇨🇴 POLICÍA: ${idNacional.estado}`);
                console.log(`🏛️ PROCURADURÍA: ${siri}`);
                console.log(`🌍 INTERPOL: ${mundo.interpol}`);
                console.log(`🇺🇸 OFAC (CLINTON): ${mundo.ofac}`);
                console.log(`==========================================\n`);
            }
        }
    }
}

start();
