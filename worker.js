const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');

puppeteer.use(StealthPlugin());

// Servidor de salud para Render (Puerto 10000)
const app = express();
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(process.env.PORT || 10000);

const client = redis.createClient({ url: process.env.REDIS_URL });

async function ejecutarConsulta(cedula) {
    // Definimos el host del proxy (IP:PUERTO)
    const proxyHost = `${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--proxy-server=${proxyHost}`
        ]
    });

    const page = await browser.newPage();

    try {
        // AUTENTICACIÓN DEL PROXY (Corrige el error ERR_NO_SUPPORTED_PROXIES)
        await page.authenticate({
            username: process.env.PROXY_USER,
            password: process.env.PROXY_PASS
        });

        console.log(`\n🤖 [Worker] Iniciando navegación para CC: ${cedula}`);
        
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Lógica para aceptar términos y condiciones
        await page.evaluate(() => {
            const checkbox = document.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.click();
            const botones = Array.from(document.querySelectorAll('button'));
            const btnAceptar = botones.find(b => b.innerText.includes('Aceptar'));
            if (btnAceptar) btnAceptar.click();
        });

        console.log(`✅ [${cedula}] Formulario de la Policía cargado con éxito.`);
        
        // Aquí puedes insertar tu lógica de resolución de captcha y lectura de datos

    } catch (e) {
        console.error(`❌ [${cedula}] Error en el proceso:`, e.message);
    } finally {
        await browser.close();
        console.log(`🔒 [${cedula}] Navegador cerrado.`);
    }
}

async function iniciar() {
    try {
        await client.connect();
        console.log("🤖 Worker conectado a Redis y esperando tareas...");

        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarConsulta(cedula);
            }
        }
    } catch (err) {
        console.error("Error en el loop del Worker:", err);
        setTimeout(iniciar, 5000); // Reintentar en 5 segundos si falla Redis
    }
}

iniciar();
