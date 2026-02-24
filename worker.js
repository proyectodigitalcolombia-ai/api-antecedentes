const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

// Servidor keep-alive para Render
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot Activo y Vigilando 🤖'));
app.listen(PORT, '0.0.0.0', () => console.log(`- Puerto ${PORT} abierto -`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function iniciarBot() {
    await client.connect();
    console.log('🤖 Bot conectado a Redis. Esperando misiones...');

    while (true) {
        try {
            const tarea = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tarea.element);
            console.log(`\n🔎 --- PROCESANDO: ${cedula} ---`);
            await procesarConsulta(cedula);
        } catch (error) {
            console.error('❌ Error en el ciclo:', error.message);
        }
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
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        console.log('🌐 Navegando a WebJudicial...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        // --- MANEJO DE TÉRMINOS EVOLUCIONADO ---
        console.log('🕵️ Analizando pantalla de términos...');
        const necesitaAceptar = await page.evaluate(() => document.body.innerText.includes('Términos de uso'));

        if (necesitaAceptar) {
            console.log('📝 Ejecutando Triple Acción para aceptar términos...');
            await page.evaluate(() => {
                const check = document.querySelector('input[type="checkbox"]');
                const btn = document.querySelector('button[id*="continuar"], input[type="submit"], .ui-button');

                if (check) {
                    check.checked = true;
                    // Disparamos eventos para que PrimeFaces se entere del cambio
                    check.dispatchEvent(new Event('change', { bubbles: true }));
                    check.dispatchEvent(new Event('click', { bubbles: true }));
                }
                
                if (btn) {
                    btn.focus();
                    btn.click();
                }
            });
            
            console.log('⏳ Esperando transición (8s)...');
            await new Promise(r => setTimeout(r, 8000)); 
            
            // Verificación secundaria: si el botón sigue ahí, clic por Puppeteer (fuera de JS)
            const sigueAhi = await page.evaluate(() => document.body.innerText.includes('Términos de uso'));
            if (sigueAhi) {
                console.log('⚠️ El clic de JS parece haber fallado, intentando clic nativo...');
                const botonNativo = await page.$('button[id*="continuar"], input[type="submit"]');
                if (botonNativo) await botonNativo.click();
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        // --- BÚSQUEDA DEL CAPTCHA ---
        console.log('🧠 Buscando imagen del Captcha...');
        const captchaSelector = 'img[src*="captcha"], img[id*="cap"], img[id*="Captcha"]';
        
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 25000 }).catch(async () => {
            const txt = await page.evaluate(() => document.body.innerText.substring(0, 300));
            throw new Error(`No se saltó la pantalla de términos. Texto: ${txt}`);
        });

        console.log('📸 Capturando Captcha...');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Captcha resuelto: ${res.data}`);

        // --- LLENADO DEL FORMULARIO ---
        await page.waitForSelector('input[id*="cedula"]', { timeout: 10000 });
        await page.type('input[id*="cedula"]', cedula);
        
        const captchaInput = await page.waitForSelector('input[id*="captcha"], input[id*="answer"]');
        await captchaInput.type(res.data);
        
        console.log('🚀 Enviando consulta...');
        await page.click('button[id*="consultar"], input[type="submit"]');
        
        await new Promise(r => setTimeout(r, 8000));

        // --- RESULTADO ---
        const resultado = await page.evaluate(() => {
            const body = document.body.innerText;
            if (body.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (body.includes('registra antecedentes')) return "CON ANTECEDENTES";
            return "ERROR: No se pudo leer el veredicto final.";
        });

        console.log(`🏁 RESULTADO PARA ${cedula}: ${resultado}`);

    } catch (error) {
        console.error(`❌ Fallo crítico: ${error.message}`);
    } finally {
        await browser.close();
        console.log(`📦 Sesión cerrada.`);
    }
}

iniciarBot();
