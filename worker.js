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
                    console.log(`\n🔎 CONSULTANDO ANTECEDENTES: ${cedula}`);
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
            '--disable-blink-features=AutomationControlled' // Oculta que es un bot
        ]
    });
    
    const page = await browser.newPage();
    
    try {
        // Configuración de "sigilo"
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1366, height: 768 });

        console.log('🌐 Navegando a la URL del formulario...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 1. GESTIÓN DE TÉRMINOS Y CONDICIONES
        await new Promise(r => setTimeout(r, 4000)); // Espera a que carguen los scripts de la página
        
        const necesitaAceptar = await page.evaluate(() => {
            return document.body.innerText.includes('Términos de uso');
        });

        if (necesitaAceptar) {
            console.log('📝 Términos detectados. Interactuando...');
            await page.evaluate(() => {
                const check = document.querySelector('input[type="checkbox"]');
                if (check) check.click();
                
                // Buscamos el botón "Aceptar" o "Enviar"
                const btn = Array.from(document.querySelectorAll('button, input[type="submit"]'))
                    .find(b => b.innerText.includes('Aceptar') || b.value?.includes('Aceptar') || b.id.includes('continuar'));
                if (btn) btn.click();
            });
            
            // Refuerzo con teclado
            await page.keyboard.press('Enter');
            console.log('⏳ Esperando al formulario principal...');
            await new Promise(r => setTimeout(r, 6000));
        }

        // 2. CAPTCHA
        console.log('📸 Buscando Captcha...');
        const captchaSelector = 'img[src*="captcha"], img[id*="cap"], img[id*="Captcha"], img[src*="Servlet"]';
        
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 25000 }).catch(async () => {
            const txt = await page.evaluate(() => document.body.innerText.substring(0, 300));
            console.log('⚠️ No se halló el selector. Texto en pantalla:', txt);
            throw new Error('Captcha no detectado');
        });

        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Solución Captcha: ${res.data}`);

        // 3. INGRESO DE DATOS (Simulando escritura humana)
        await page.waitForSelector('input[id*="cedula"]', { timeout: 10000 });
        await page.type('input[id*="cedula"]', cedula, { delay: 100 });
        
        const inputCaptcha = await page.waitForSelector('input[id*="captcha"], input[id*="answer"]');
        await inputCaptcha.type(res.data, { delay: 100 });
        
        await page.keyboard.press('Enter');

        // 4. LECTURA DE RESULTADOS
        console.log('🚀 Esperando respuesta del servidor...');
        await new Promise(r => setTimeout(r, 10000));

        const veredicto = await page.evaluate(() => {
            const body = document.body.innerText;
            if (body.includes('No tiene asuntos pendientes')) return "SIN ANTECEDENTES";
            if (body.includes('registra antecedentes')) return "CON ANTECEDENTES";
            if (body.includes('Captcha incorrecto')) return "ERROR: CAPTCHA INCORRECTO";
            return "RESULTADO DESCONOCIDO / ERROR DE CARGA";
        });

        console.log(`🏁 FINALIZADO: ${cedula} -> ${veredicto}`);

    } catch (error) {
        console.error(`❌ Fallo en el proceso: ${error.message}`);
    } finally {
        await browser.close();
        console.log('📦 Navegador cerrado.');
    }
}

ejecutarServicio();
