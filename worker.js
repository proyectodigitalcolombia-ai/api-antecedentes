const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// Configuración de carpetas
const dir = path.join(__dirname, 'capturas');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const app = express();
// Servir las imágenes directamente desde el Worker
app.use('/ver', express.static(dir));

app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor del Worker activo en puerto ${PORT}`);
});

const client = redis.createClient({ url: process.env.REDIS_URL });
client.on('error', (err) => {}); // Silenciar errores de conexión repetitivos

async function ejecutarConsulta(cedula) {
    console.log(`\n🔎 [${cedula}] Iniciando proceso...`);
    
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        console.log(`📡 Navegando a la Policía...`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Esperar y aceptar el modal de términos
        await new Promise(r => setTimeout(r, 5000));
        const checkbox = 'input[type="checkbox"]';
        if (await page.$(checkbox)) {
            await page.click(checkbox);
            await page.keyboard.press('Enter');
            console.log("✅ Términos aceptados.");
            await new Promise(r => setTimeout(r, 3000));
        }

        // Tomar la captura
        const nombreArchivo = `${cedula}.png`;
        const rutaFinal = path.join(dir, nombreArchivo);
        await page.screenshot({ path: rutaFinal, fullPage: true });
        
        console.log(`📸 Captura lista para CC ${cedula}`);

    } catch (e) {
        console.error(`❌ Error en consulta ${cedula}:`, e.message);
    } finally {
        await browser.close();
    }
}

async function iniciar() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🤖 Worker conectado a Redis y esperando tareas...");
        
        while (true) {
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                const { cedula } = JSON.parse(tarea.element);
                await ejecutarConsulta(cedula);
            }
        }
    } catch (err) {
        setTimeout(iniciar, 5000);
    }
}

iniciar();
