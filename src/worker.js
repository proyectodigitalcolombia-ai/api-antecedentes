const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');

// 1. Configuración de Redis
const client = createClient({
    url: process.env.REDIS_URL
});

client.on('error', (err) => console.log('❌ Error en Redis Client:', err));

// 2. Función Principal de Scraping (Blindada)
async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA: ${cedula} ---`);
        
        // Esta es la ruta exacta donde Render instaló Chrome en tu último log
        const rutaManual = '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';
        
        console.log(`🚀 Forzando apertura de Chrome en: ${rutaManual}`);

        browser = await puppeteer.launch({
            executablePath: rutaManual,
            // IMPORTANTE: ignora configuraciones externas (.puppeteerrc) que causan el error 'puppetee'
            ignoreDefaultArgs: ['--disable-extensions'], 
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        
        // Configurar un User Agent real para evitar bloqueos
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log(`🔎 Navegando a la página de la Policía para: ${cedula}`);
        
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // --- INSERTA AQUÍ TU LÓGICA ESPECÍFICA DE EXTRACCIÓN (CLICS, CAPTCHA, ETC.) ---
        
        console.log("✅ Página cargada con éxito. Procesando datos...");

        // Ejemplo de cómo guardar el resultado en Redis para que la API lo lea
        const resultadoSimulado = { cedula, estado: "Sin Antecedentes", fecha: new Date() };
        await client.set(`resultado:${cedula}`, JSON.stringify(resultadoSimulado), { EX: 3600 });

    } catch (error) {
        console.error(`❌ ERROR EN EL PROCESO (${cedula}):`, error.message);
        // Notificar el error en Redis
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: error.message }), { EX: 300 });
    } finally {
        if (browser) {
            await browser.close();
            console.log("🔒 Navegador cerrado.");
        }
        console.log(`--- 🏁 FIN DE LA TAREA: ${cedula} ---`);
    }
}

// 3. Bucle de escucha de Redis (Worker)
async function iniciarWorker() {
    try {
        if (!client.isOpen) await client.connect();
        console.log("🚀 WORKER CONECTADO A REDIS Y LISTO");

        while (true) {
            // Espera tareas de la cola (bloqueante)
            const tarea = await client.brPop('cola_consultas', 0);
            if (tarea) {
                console.log("🔔 ¡TAREA RECIBIDA!");
                const data = JSON.parse(tarea.element);
                const idCedula = data.cedula || data; 
                await ejecutarScraping(idCedula);
                console.log('👀 Esperando nueva tarea en "cola_consultas"...');
            }
        }
    } catch (error) {
        console.error("❌ ERROR FATAL EN EL WORKER:", error);
        setTimeout(iniciarWorker, 5000); // Reintentar en 5 segundos
    }
}

// 4. Servidor de Salud (Indispensable para Render)
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('Worker Bot Funcionando 🤖'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 Servidor de salud activo en puerto ${PORT}`);
    iniciarWorker();
});
