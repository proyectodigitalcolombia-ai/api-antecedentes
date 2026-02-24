const puppeteer = require('puppeteer');
const redis = require('redis');

// Configuración de Redis (Render usa variables de entorno para esto)
const client = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => console.log('Redis Client Error', err));

async function processQueue() {
    try {
        await client.connect();
        console.log("🚀 Redis Conectado y esperando mensajes...");

        while (true) {
            // Suponiendo que usas una cola llamada 'consultas'
            const result = await client.blPop('consultas', 0);
            const data = JSON.parse(result.element);
            
            console.log(`🔎 Procesando consulta para: ${data.id}`);

            const browser = await puppeteer.launch({
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--single-process'
                ]
            });

            const page = await browser.newPage();
            
            try {
                // AQUÍ VA TU LÓGICA DE NAVEGACIÓN
                // Ejemplo:
                // await page.goto('https://ejemplo.com');
                // const info = await page.evaluate(() => document.title);
                
                console.log(`✅ Tarea completada para ${data.id}`);
                
            } catch (innerError) {
                console.error("❌ Error navegando:", innerError);
            } finally {
                await browser.close();
            }
        }
    } catch (error) {
        console.error("🚨 Error crítico en el worker:", error);
        // Intentar reconectar tras un error
        setTimeout(processQueue, 5000);
    }
}

// Iniciar el proceso
processQueue();
