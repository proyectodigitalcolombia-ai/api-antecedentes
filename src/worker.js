const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');

// Configuración de Redis
const client = createClient({ url: process.env.REDIS_URL });

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 PROCESANDO CÉDULA: ${cedula} ---`);
        
        // RUTA MANUAL: Esta es la que instaló Render en tu cuenta de pago
        const rutaManual = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';
        
        console.log(`🚀 Intentando abrir navegador en: ${rutaManual}`);

        browser = await puppeteer.launch({
            executablePath: rutaManual,
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        console.log("✅ Navegador abierto. Entrando a la web de la policía...");
        
        // Timeout de 60 segundos para evitar que se quede colgado
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        console.log("📍 Página cargada. Resolviendo lógica...");
        
        // --- AQUÍ VA TU LÓGICA DE CLIC EN EL CAPTCHA Y EXTRACCIÓN ---
        
        // Ejemplo de actualización en Redis al finalizar (ajustar según tu JSON)
        const resultadoFinal = { status: "exito", data: "Sin antecedentes" };
        await client.set(`resultado:${cedula}`, JSON.stringify(resultadoFinal), { EX: 3600 });
        
        console.log(`✅ Tarea terminada para: ${cedula}`);

    } catch (e) {
        console.error(`❌ ERROR REAL EN EL PROCESO (${cedula}):`, e.message);
        // Guardamos el error en Redis para que la API sepa qué pasó
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) {
            await browser.close();
            console.log("🔒 Navegador cerrado correctamente.");
        }
        console.log('--- 🏁 FIN DE LA TAREA ---');
    }
}

// Bucle principal del Worker
async function iniciar() {
    try {
        await client.connect();
        console.log("🚀 WORKER LISTO Y CONECTADO A REDIS");

        while (true) {
            const t = await client.brPop('cola_consultas', 0);
            if (t) {
                const data = JSON.parse(t.element);
                const cedulaTarget = data.cedula || data; // Soporta {cedula: "..."} o "..."
                await ejecutarScraping(cedulaTarget);
                console.log('👀 Esperando nueva tarea en "cola_consultas"...');
            }
        }
    } catch (err) {
        console.error("❌ Error fatal en el inicio del Worker:", err);
    }
}

// Servidor de salud para que Render no lo mate
const app = express();
app.get('/', (req, res) => res.send('Worker Activo'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => iniciar());
