const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health Check activo`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function ejecutarServicio() {
    try {
        await client.connect();
        console.log('🤖 Bot listo. Escuchando Redis...');

        while (true) {
            try {
                const tarea = await client.brPop('cola_consultas', 0);
                if (tarea) {
                    const { cedula } = JSON.parse(tarea.element);
                    console.log(`\n🔎 CONSULTANDO: ${cedula}`);
                    await procesarConsulta(cedula);
                }
            } catch (err) {
                console.error('❌ Error en tarea:', err.message);
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
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
        ]
    });
    
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        console.log('🌐 Accediendo a la raíz (WebJudicial/)...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/', {
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Esperamos un momento para ver si redirige o si hay que aceptar términos
        await new Promise(r => setTimeout(r, 5000));

        // 1. GESTIÓN DE TÉRMINOS (Si aparecen en esta URL)
        const necesitaAceptar = await page.evaluate(() => document.body.innerText.includes('Términos de uso'));

        if (necesitaAceptar) {
            console.log('📝 Términos detectados. Forzando aceptación...');
            await page.evaluate(() => {
                const ck = document.querySelector('input[type="checkbox"]');
                if (ck) {
                    ck.checked = true;
                    ck.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const btn = Array.from(document.querySelectorAll('button, input[type="submit"], .ui-button'))
                    .find(b => b.innerText.toLowerCase().includes('aceptar') || b.id.includes('continuar'));
                if (btn) btn.click();
            });
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 8000));
        }

        // 2. BUSCAR CAPTCHA
        console.log('📸 Buscando Captcha...');
        const captchaSelector = 'img[src*="captcha"], img[id*="cap"], img[src*="Servlet"]';
        
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 25000 }).catch(async () => {
            // Si no está, quizás debemos navegar un paso más adentro
            console.log('ℹ️ No se vio el captcha, intentando ir a la página de antecedentes...');
            await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { waitUntil: 'networkidle2' });
            return await page.waitForSelector(captchaSelector, { timeout: 15000 });
        });

        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Captcha resuelto: ${res.data}`);

        // 3. LLENADO
        await page.type('input[id*="cedula"]', cedula, { delay: 100 });
        await page.type('input[id*="captcha"], input[id*="answer"]', res.data, { delay: 100 });
        await page.keyboard.press('Enter');

        // 4. RESULTADO
        await new Promise(r => setTimeout(r, 10000));
        const veredicto = await page.evaluate(() => {
            const body = document.body.innerText;
            if (body.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (body.includes('registra antecedentes')) return "CON ANTECEDENTES";
            return "NO_DETECTADO";
        });

        console.log(`🏁 RESULTADO PARA ${cedula}: ${veredicto}`);

    } catch (error) {
        console.error(`❌ Fallo crítico: ${error.message}`);
    } finally {
        await browser.close();
        console.log('📦 Sesión cerrada.');
    }
}

ejecutarServicio();
