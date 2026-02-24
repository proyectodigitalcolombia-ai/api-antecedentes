const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

// Servidor para que Render no mate el proceso
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot Activo 🤖'));
app.listen(PORT, '0.0.0.0', () => console.log(`- Dummy port ${PORT} open -`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA || 'TU_API_KEY_AQUI');
const client = redis.createClient({ url: process.env.REDIS_URL });

async function iniciarBot() {
    try {
        await client.connect();
        console.log('🤖 Bot conectado a Redis y esperando tareas...');

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            const { cedula } = JSON.parse(tarea.element);
            console.log(`\n🔎 --- NUEVA TAREA: ${cedula} ---`);
            await procesarConsulta(cedula);
        }
    } catch (err) {
        console.error('❌ Error fatal en el Bot:', err);
        setTimeout(iniciarBot, 5000); // Reintento si cae la conexión
    }
}

async function procesarConsulta(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
        
        console.log('🌐 Navegando a la URL WebJudicial...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        // 1. Manejo dinámico de términos o carga directa
        try {
            const termsFound = await page.waitForSelector('input[type="checkbox"]', { timeout: 8000 });
            if (termsFound) {
                await page.click('input[type="checkbox"]');
                await page.click('input[type="submit"]');
                console.log('✅ Términos aceptados.');
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (e) {
            console.log('ℹ️ No se detectó checkbox de términos, verificando formulario...');
        }

        // 2. Esperar el formulario real
        console.log('🧠 Buscando campos de consulta...');
        await page.waitForSelector('input[id*="cedula"]', { timeout: 20000 });

        // 3. Capturar Captcha
        console.log('📸 Obteniendo Captcha...');
        const captchaImg = await page.waitForSelector('img[id*="captcha"]');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });

        const res = await solver.imageCaptcha(screenshot);
        console.log(`✅ Captcha resuelto por 2Captcha: ${res.data}`);

        // 4. Llenar datos
        await page.type('input[id*="cedula"]', cedula);
        await page.type('input[id*="captcha"]', res.data);
        
        // Clic en el botón de consulta (usando selector parcial para mayor seguridad)
        await page.click('button[id*="consultar"], input[type="submit"]');

        console.log('⏳ Esperando respuesta de la base de datos...');
        await new Promise(r => setTimeout(r, 5000));

        const resultado = await page.evaluate(() => {
            const texto = document.body.innerText;
            if (texto.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (texto.includes('registra antecedentes')) return "CON ANTECEDENTES";
            return "ERROR_PAGINA: " + texto.substring(0, 100);
        });

        console.log(`🏁 RESULTADO PARA ${cedula}: ${resultado}`);

    } catch (error) {
        console.error(`❌ Fallo en el proceso: ${error.message}`);
    } finally {
        console.log(`🏁 Sesión cerrada para ${cedula}`);
        await browser.close();
    }
}

iniciarBot();
