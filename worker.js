const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

// Servidor de salud para Render
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health Check activo en puerto ${PORT}`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function ejecutarServicio() {
    try {
        await client.connect();
        console.log('🤖 Bot operativo. Escuchando Redis...');

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
        console.error('❌ Error fatal Redis:', err);
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
        await page.setViewport({ width: 1366, height: 768 });

        console.log('🌐 Navegando a la Policía...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // --- 1. GESTIÓN DE TÉRMINOS CON CLIC REFORZADO ---
        await new Promise(r => setTimeout(r, 5000));
        const tieneTerminos = await page.evaluate(() => document.body.innerText.includes('Términos de uso'));

        if (tieneTerminos) {
            console.log('📝 Detectada pantalla de términos. Forzando interacción...');
            
            // Acción 1: Marcar Checkbox vía JS y disparar evento
            await page.evaluate(() => {
                const ck = document.querySelector('input[type="checkbox"]');
                if (ck) {
                    ck.checked = true;
                    ck.dispatchEvent(new Event('change', { bubbles: true }));
                    ck.dispatchEvent(new Event('click', { bubbles: true }));
                }
            });

            await new Promise(r => setTimeout(r, 1500));

            // Acción 2: Clic en el botón Aceptar/Continuar
            const botonAcepto = await page.evaluateHandle(() => {
                const botones = Array.from(document.querySelectorAll('button, input[type="submit"], .ui-button'));
                return botones.find(b => 
                    b.innerText.toLowerCase().includes('aceptar') || 
                    b.value?.toLowerCase().includes('aceptar') || 
                    b.id.toLowerCase().includes('continuar')
                );
            });

            if (botonAcepto) {
                await botonAcepto.asElement().click();
                console.log('🖱️ Clic en botón de aceptar enviado.');
            }

            // Acción 3: Enter físico por si los clics fallaron
            await page.keyboard.press('Enter');
            
            console.log('⏳ Esperando carga del Captcha (10s)...');
            await new Promise(r => setTimeout(r, 10000));
        }

        // --- 2. CAPTCHA ---
        console.log('📸 Buscando Captcha...');
        const captchaSelector = 'img[src*="captcha"], img[id*="cap"], img[id*="Captcha"], img[src*="Servlet"]';
        
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 25000 }).catch(async () => {
            const txt = await page.evaluate(() => document.body.innerText.substring(0, 500));
            console.log('⚠️ No se saltó la pantalla. Contenido actual:', txt);
            throw new Error('Bloqueo en pantalla de términos (No se ve el Captcha)');
        });

        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Captcha resuelto: ${res.data}`);

        // --- 3. LLENADO ---
        await page.waitForSelector('input[id*="cedula"]', { timeout: 10000 });
        await page.type('input[id*="cedula"]', cedula, { delay: 150 });
        
        const inputCaptcha = await page.waitForSelector('input[id*="captcha"], input[id*="answer"]');
        await inputCaptcha.type(res.data, { delay: 150 });
        
        console.log('🚀 Enviando consulta final...');
        await page.keyboard.press('Enter');

        await new Promise(r => setTimeout(r, 10000));

        // --- 4. RESULTADO ---
        const veredicto = await page.evaluate(() => {
            const body = document.body.innerText;
            if (body.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (body.includes('registra antecedentes')) return "CON ANTECEDENTES";
            if (body.includes('incorrecto')) return "ERROR_CAPTCHA";
            return "RESULTADO_NO_DETECTADO";
        });

        console.log(`🏁 FINALIZADO PARA ${cedula}: ${veredicto}`);

    } catch (error) {
        console.error(`❌ Fallo crítico: ${error.message}`);
    } finally {
        await browser.close();
        console.log('📦 Sesión cerrada.');
    }
}

ejecutarServicio();
