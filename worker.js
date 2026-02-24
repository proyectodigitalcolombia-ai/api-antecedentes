const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// 1. Asegurar que la carpeta de capturas existe ANTES de todo
const dir = './capturas';
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

const app = express();
// Servir las capturas para que puedas verlas en el navegador
app.use('/capturas', express.static(path.join(__dirname, 'capturas')));

app.get('/health', (req, res) => res.status(200).send('OK'));

// 2. Iniciar el servidor de Express (Vital para Render)
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor de salud y capturas en puerto ${PORT}`);
});

const client = redis.createClient({ url: process.env.REDIS_URL });
client.on('error', (err) => console.error('Error en Redis:', err.message));

async function ejecutarConsulta(cedula) {
    console.log(`\n🔎 [${cedula}] Iniciando navegación...`);
    
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Intentar aceptar el modal
        console.log(`⏳ Buscando términos...`);
        try {
            await page.waitForSelector('input[type="checkbox"]', { timeout: 15000 });
            await page.click('input[type="checkbox"]');
            await page.keyboard.press('Enter'); 
            await new Promise(r => setTimeout(r, 4000));
        } catch (errModal) {
            console.log("⚠️ El modal no apareció o ya se aceptó.");
        }

        const fotoPath = path.join(dir, `${cedula}.png`);
        await page.screenshot({ path: fotoPath, fullPage: true });

        console.log(`✅ [${cedula}] Captura guardada con éxito.`);

    } catch (e) {
        console.error(`❌ [${cedula}] Error: ${e.message}`);
    } finally {
        await browser.close();
    }
}

async function iniciar() {
    try {
        console.log("🔄 Conectando a Redis...");
        if (!client.isOpen) await client.connect();
        console.log("🤖 Worker listo y esperando tareas.");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarConsulta(cedula);
            }
        }
    } catch (err) {
        console.error("💥 Error en el bucle principal:", err.message);
        setTimeout(iniciar, 5000);
    }
}

iniciar();
