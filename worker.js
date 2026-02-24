const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

// ACTIVAR MODO SIGILO
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health Check activo`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function ejecutarServicio() {
    try {
        await client.connect();
        console.log('🤖 Bot Stealth iniciado y escuchando tareas...');

        while (true) {
            try {
                const tarea = await client.brPop('cola_consultas', 0);
                if (tarea) {
                    const { cedula } = JSON.parse(tarea.element);
                    console.log(`\n🔎 CONSULTANDO CÉDULA: ${cedula}`);
                    await procesarConsulta(cedula);
                }
            } catch (err) {
                console.error('❌ Error en el ciclo:', err.message);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    } catch (err) {
        console.error('❌ Error de conexión Redis:', err);
    }
}

async function procesarConsulta(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
        ]
    });
    
    const page = await browser.newPage();
    
    try {
        // Camuflaje de navegador humano
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });

        console.log('🌐 Navegando a la Policía con Stealth...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2', timeout: 60000 
        });

        // Pausa para que carguen los scripts pesados de PrimeFaces
        await new Promise(r => setTimeout(r, 7000));

        // --- SALTAR TÉRMINOS CON CLIC FÍSICO SIMULADO ---
        const terminosEnPantalla = await page.evaluate(() => document.body.innerText.includes('Términos de uso'));

        if (terminosEnPantalla) {
            console.log('📝 Términos detectados. Realizando secuencia de clic humano...');
            
            const checkbox = await page.$('input[type="checkbox"]');
            if (checkbox) {
                const box = await checkbox.boundingBox();
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                await new Promise(r => setTimeout(r, 1500));
            }

            const botonAceptar = await page.evaluateHandle(() => {
                return Array.from(document.querySelectorAll('button, input[type="submit"]'))
                    .find(b => b.innerText.includes('Aceptar') || b.id.includes('continuar'));
            });

            if (botonAceptar && botonAceptar.asElement()) {
                const btnBox = await botonAceptar.asElement().boundingBox();
                await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
            }
            
            // Refuerzo con teclado
            await page.keyboard.press('Enter');
            console.log('⏳ Esperando carga del formulario (12s)...');
            await new Promise(r => setTimeout(r, 12000));
        }

        // --- RESOLVER CAPTCHA ---
        console.log('📸 Buscando Captcha...');
        const captchaSelector = 'img[src*="captcha"], img[id*="cap"], img[src*="Servlet"]';
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 20000 });
        
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Captcha resuelto por 2Captcha: ${res.data}`);

        // --- LLENAR DATOS ---
        await page.type('input[id*="cedula"]', cedula, { delay: 150 });
        await page.type('input[id*="captcha"]', res.data, { delay: 150 });
        await page.keyboard.press('Enter');

        // --- EXTRAER RESULTADO ---
        await new Promise(r => setTimeout(r, 10000));
        const resultado = await page.evaluate(() => {
            const t = document.body.innerText;
            if (t.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (t.includes('registra antecedentes')) return "CON ANTECEDENTES";
            return "RESULTADO_NO_DETECTADO";
        });

        console.log(`🏁 FIN PROCESO: ${cedula} -> ${resultado}`);

    } catch (error) {
        const txtActual = await page.evaluate(() => document.body.innerText.substring(0, 150));
        console.error(`❌ Error en misión: ${error.message}. Pantalla actual: ${txtActual}`);
    } finally {
        await browser.close();
        console.log('📦 Sesión terminada.');
    }
}

ejecutarServicio();
