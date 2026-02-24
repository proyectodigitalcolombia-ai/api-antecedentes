const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

// Servidor dummy para Render
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot Operativo 🤖'));
app.listen(PORT, '0.0.0.0', () => console.log(`- Keep-alive puerto ${PORT} -`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function iniciarBot() {
    await client.connect();
    console.log('🤖 Bot listo para procesar cola de Redis...');

    while (true) {
        try {
            const tarea = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tarea.element);
            console.log(`\n🔎 --- INICIANDO CONSULTA: ${cedula} ---`);
            await procesarConsulta(cedula);
        } catch (error) {
            console.error('❌ Error en ciclo:', error.message);
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

        // --- MANEJO AGRESIVO DE TÉRMINOS ---
        console.log('🕵️ Analizando si hay términos...');
        const necesitaAceptar = await page.evaluate(() => {
            return document.body.innerText.includes('Términos de uso');
        });

        if (necesitaAceptar) {
            console.log('📝 Términos detectados. Forzando clics con JS...');
            await page.evaluate(() => {
                // 1. Buscar y marcar el checkbox
                const inputs = Array.from(document.querySelectorAll('input'));
                const checkbox = inputs.find(i => i.type === 'checkbox' || i.id.toLowerCase().includes('acepto'));
                if (checkbox) checkbox.click();

                // 2. Buscar y clickear el botón de enviar
                const botones = Array.from(document.querySelectorAll('input[type="submit"], button, a.ui-button'));
                const enviar = botones.find(b => 
                    b.innerText?.toLowerCase().includes('aceptar') || 
                    b.value?.toLowerCase().includes('aceptar') ||
                    b.id.toLowerCase().includes('continuar')
                );
                if (enviar) enviar.click();
            });
            
            console.log('⏳ Esperando a que cargue el formulario después de aceptar...');
            await new Promise(r => setTimeout(r, 5000));
        }

        // --- BÚSQUEDA DEL CAPTCHA ---
        console.log('🧠 Buscando imagen del Captcha...');
        const captchaSelector = 'img[src*="captcha"], img[id*="cap"], img[id*="Captcha"]';
        
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 25000 }).catch(async () => {
            const txt = await page.evaluate(() => document.body.innerText.substring(0, 200));
            throw new Error(`Captcha no visible. La página dice: ${txt}`);
        });

        console.log('📸 Capturando Captcha para 2Captcha...');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Solución recibida: ${res.data}`);

        // --- LLENADO DEL FORMULARIO ---
        await page.waitForSelector('input[id*="cedula"]', { timeout: 10000 });
        await page.type('input[id*="cedula"]', cedula);
        
        const captchaInput = await page.waitForSelector('input[id*="captcha"], input[id*="answer"]');
        await captchaInput.type(res.data);
        
        console.log('🚀 Enviando consulta final...');
        await page.click('button[id*="consultar"], input[type="submit"]');
        
        await new Promise(r => setTimeout(r, 7000));

        // --- EXTRACCIÓN DEL RESULTADO ---
        const resultado = await page.evaluate(() => {
            const body = document.body.innerText;
            if (body.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (body.includes('registra antecedentes')) return "CON ANTECEDENTES";
            return "RESULTADO INCIERTO (Verificar manualmente)";
        });

        console.log(`🏁 RESULTADO PARA ${cedula}: ${resultado}`);

    } catch (error) {
        console.error(`❌ Fallo en el proceso: ${error.message}`);
    } finally {
        await browser.close();
        console.log(`📦 Sesión cerrada.`);
    }
}

iniciarBot();
