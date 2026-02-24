const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

// Activar el modo sigilo
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
        console.log('🤖 Bot Stealth operativo. Esperando tareas...');

        while (true) {
            try {
                const tarea = await client.brPop('cola_consultas', 0);
                if (tarea) {
                    const { cedula } = JSON.parse(tarea.element);
                    console.log(`\n🔎 CONSULTANDO: ${cedula}`);
                    await procesarConsulta(cedula);
                }
            } catch (err) {
                console.error('❌ Error en ciclo:', err.message);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    } catch (err) {
        console.error('❌ Fallo conexión Redis:', err);
    }
}

async function procesarConsulta(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--window-size=1280,800'
        ]
    });
    
    const page = await browser.newPage();
    
    try {
        // Configuraciones extra de humanidad
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9' });

        console.log('🌐 Navegando con Stealth Mode...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2', timeout: 60000 
        });

        await new Promise(r => setTimeout(r, 7000));

        // --- MANEJO DE TÉRMINOS CON CLIC FÍSICO ---
        const necesitaTerminos = await page.evaluate(() => document.body.innerText.includes('Términos de uso'));

        if (necesitaTerminos) {
            console.log('📝 Aceptando términos con simulador de mouse...');
            
            const checkbox = await page.$('input[type="checkbox"]');
            if (checkbox) {
                const box = await checkbox.boundingBox();
                await page.mouse.click(box.x + 2, box.y + 2); // Clic en la esquina del checkbox
                await new Promise(r => setTimeout(r, 1000));
            }

            const btn = await page.evaluateHandle(() => {
                return Array.from(document.querySelectorAll('button, input[type="submit"]'))
                    .find(b => b.innerText.includes('Aceptar') || b.id.includes('continuar'));
            });

            if (btn && btn.asElement()) {
                const btnBox = await btn.asElement().boundingBox();
                await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
                console.log('🖱️ Clic físico en Aceptar.');
            }

            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 12000));
        }

        // --- CAPTCHA ---
        const captchaSelector = 'img[src*="captcha"], img[id*="cap"], img[src*="Servlet"]';
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 20000 });
        
        console.log('📸 Captcha encontrado. Resolviendo...');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const res = await solver.imageCaptcha(screenshot);
        
        // --- LLENADO ---
        await page.type('input[id*="cedula"]', cedula, { delay: 150 });
        await page.type('input[id*="captcha"]', res.data, { delay: 150 });
        await page.keyboard.press('Enter');

        await new Promise(r => setTimeout(r, 8000));

        const veredicto = await page.evaluate(() => {
            const t = document.body.innerText;
            if (t.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (t.includes('registra antecedentes')) return "CON ANTECEDENTES";
            return "RESULTADO_NO_CLARO";
        });

        console.log(`🏁 FINAL: ${cedula} -> ${veredicto}`);

    } catch (error) {
        const errorText = await page.evaluate(() => document.body.innerText.substring(0, 150));
        console.error(`❌ Fallo: ${error.message}. Pantalla: ${errorText}`);
    } finally {
        await browser.close();
        console.log('📦 Sesión cerrada.');
    }
}

ejecutarServicio();
