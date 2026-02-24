const puppeteer = require('puppeteer');
const redis = require('redis');

// 1. Configuración de la URL de Redis
// Asegúrate de tener la variable REDIS_URL configurada en el Dashboard de Render
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const NOMBRE_COLA = 'cola_consultas'; 

const client = redis.createClient({ url: REDIS_URL });

client.on('error', (err) => console.log('❌ Error en Redis Client:', err));

async function iniciarWorker() {
    try {
        console.log("⏳ Conectando a Redis...");
        await client.connect();
        console.log("🚀 REDIS: Conectado con éxito.");

        // Loop infinito de escucha
        while (true) {
            console.log(`📡 Esperando mensajes en la cola: [${NOMBRE_COLA}]...`);
            
            // blPop espera hasta que llegue un mensaje (bloqueante)
            const registro = await client.blPop(NOMBRE_COLA, 0);
            
            if (registro) {
                const data = JSON.parse(registro.element);
                console.log(`🔎 TRABAJO RECIBIDO: Procesando cédula ${data.cedula}`);

                let browser;
                try {
                    browser = await puppeteer.launch({
                        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                    });

                    const page = await browser.newPage();
                    
                    // --- AQUÍ EMPIEZA TU LÓGICA DE NAVEGACIÓN ---
                    console.log(`🌐 Abriendo navegador para: ${data.cedula}`);
                    // await page.goto('https://www.ejemplo.com'); 
                    // --------------------------------------------

                    console.log(`✅ PROCESO COMPLETADO para: ${data.cedula}`);

                } catch (err) {
                    console.error(`❌ Error en Puppeteer para ${data.cedula}:`, err.message);
                } finally {
                    if (browser) await browser.close();
                }
            }
        }
    } catch (error) {
        console.error("🚨 ERROR CRÍTICO EN EL WORKER:", error);
        console.log("🔄 Reintentando conexión en 5 segundos...");
        setTimeout(iniciarWorker, 5000);
    }
}

// Iniciar el sistema
iniciarWorker();
