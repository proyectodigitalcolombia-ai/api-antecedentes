const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Configuración de Puppeteer
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;

// Carpeta para guardar las capturas
const dir = './ver';
if (!fs.existsSync(dir)) fs.mkdirSync(dir);
app.use('/ver', express.static(path.join(__dirname, 'ver')));

// Endpoint de Salud para Render
app.get('/health', (req, res) => res.send('Worker Live ✅'));

// Servidor para ver las fotos
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor del Worker activo en puerto ${PORT}`);
});

// Configuración de Redis
const client = redis.createClient({ url: process.env.REDIS_URL });
client.on('error', (err) => console.log('Redis Error', err));

async function iniciarWorker() {
    await client.connect();
    console.log('🤖 Worker conectado a Redis y esperando tareas...');

    while (true) {
        try {
            // Extraer tarea de la cola (espera bloqueante de 30s)
            const tarea = await client.brPop('cola_consultas', 30);
            
            if (tarea) {
                const data = JSON.parse(tarea.element);
                console.log(`🔎 Procesando cédula: ${data.cedula}`);
                await ejecutarBot(data.cedula);
            }
        } catch (error) {
            console.error('Error en el ciclo del Worker:', error);
        }
    }
}

async function ejecutarBot(cedula) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Ir a la web de la policía
        await page.goto('https://srvandroid.policia.gov.co/ some-url-here', { waitUntil: 'networkidle2' });

        // --- LÓGICA DE CLICS ---
        // 1. Aceptar términos (si aparecen)
        try {
            await page.waitForSelector('input[type="checkbox"]', { timeout: 5000 });
            await page.click('input[type="checkbox"]');
            // Aquí podrías necesitar hacer clic en el botón "Enviar" del aviso legal
        } catch (e) {
            console.log("No se encontró el cuadro de términos, procediendo...");
        }

        // 2. Tomar captura de pantalla
        const filePath = path.join(__dirname, 'ver', `${cedula}.png`);
        await page.screenshot({ path: filePath });
        console.log(`📸 Captura guardada para ${cedula}`);

    } catch (err) {
        console.error(`❌ Error con cédula ${cedula}:`, err.
