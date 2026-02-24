const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor de salud activo`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function ejecutarServicio() {
    try {
        await client.connect();
        console.log('🤖 Bot Sniper listo. Esperando tareas...');

        while (true) {
            try {
                const tarea = await client.brPop('cola_consultas', 0);
                if (tarea) {
                    const { cedula } = JSON.parse(tarea.element);
                    console.log(`\n🔎 INICIANDO MISIÓN: ${cedula}`);
                    await procesarConsulta(cedula);
                }
            } catch (err) {
                console.error('❌ Error en ciclo:', err.message);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    } catch (err) {
        console.error('❌ Error conexión Redis:', err);
    }
}

async function procesarConsulta(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-blink-features=AutomationControlled'
        ]
    });
    
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });

        console.log('🌐 Navegando a la Policía...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2', timeout: 60000 
        });

        await new Promise(r => setTimeout(r, 6000));

        // --- 1. CLIC FÍSICO EN CHECKBOX ---
        console.log('🎯 Apuntando al Checkbox...');
        const checkbox = await page.$('input[type="checkbox"]');
        if (checkbox) {
            const box = await checkbox.boundingBox();
            if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                console.log(`🖱️ Clic físico en Checkbox enviado a [${box.x}, ${box.y}]`);
            }
        }

        await new Promise(r => setTimeout(r, 2000));

        // --- 2. CLIC FÍSICO EN BOTÓN ACEPTAR ---
        console.log('🎯 Apuntando al Botón Aceptar...');
        const boton = await page.evaluateHandle(() => {
            return Array.from(document.querySelectorAll('button, input[type="submit"], .ui-button'))
                .find(b => b.innerText.toLowerCase().includes('aceptar') || b.id.toLowerCase().includes('continuar'));
        });

        if (boton && boton.asElement()) {
            const btnBox = await boton.asElement().boundingBox();
            if (btnBox) {
                await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
                console.log(`🖱️ Clic físico en Botón enviado a [${btnBox.x}, ${btnBox.y}]`);
            }
        }

        // Refuerzo con Enter
        await page.keyboard.press('Enter');
        console.log('⏳ Esperando transición al Captcha (12s)...');
        await new Promise(r => setTimeout(r, 12000));

        // --- 3. CAPTCHA ---
        const captchaSelector = 'img[src*="captcha"], img[id*="cap"], img[src*="Servlet"]';
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 15000 }).catch(async () => {
            const txt = await page.evaluate(() => document.body.innerText.substring(0, 200));
            throw new Error(`Seguimos atrapados en términos. Texto: ${txt}`);
        });

        console.log('📸 Captcha detectado. Resolviendo...');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Solución: ${res.data}`);

        // --- 4. LLENADO Y RESULTADO ---
        await page.type('input[id*="cedula"]', cedula, { delay: 100 });
        await page.type('input[id*="captcha"]', res.data, { delay: 100 });
        await page.keyboard.press('Enter');

        await new Promise(r => setTimeout(r, 8000));

        const veredicto = await page.evaluate(() => {
            const t = document.body.innerText;
            if (t.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (t.includes('registra antecedentes')) return "CON ANTECEDENTES";
            return "ERROR_DESCONOCIDO";
        });

        console.log(`🏁 RESULTADO PARA ${cedula}: ${veredicto}`);

    } catch (error) {
        console.error(`❌ Fallo en misión: ${error.message}`);
    } finally {
        await browser.close();
        console.log('📦 Sesión cerrada.');
    }
}

ejecutarServicio();
