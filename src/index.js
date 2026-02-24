const puppeteer = require('puppeteer');
const redis = require('redis');
const http = require('http'); // Necesario para el Health Check

// 1. SERVIDOR DE SALUD (Para que Render se ponga en VERDE)
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Worker is Live');
}).listen(PORT, () => {
    console.log(`✅ Health Check activo en puerto ${PORT}`);
});

// 2. CONFIGURACIÓN REDIS
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const NOMBRE_COLA = 'cola_consultas'; 

const client = redis.createClient({ url: REDIS_URL });
client.on('error', (err) => console.log('❌ Error en Redis Client:', err));

async function iniciarWorker() {
    try {
        console.log("⏳ Conectando a Redis...");
        await client.connect();
        console.log("🚀 REDIS: Conectado con éxito.");

        while (true) {
            console.log(`📡 Esperando mensajes en [${NOMBRE_COLA}]...`);
            
            // blPop espera hasta que llegue un mensaje
            const registro = await client.blPop(NOMBRE_COLA, 0);
            
            if (registro) {
                const data = JSON.parse(registro.element);
                console.log(`🔎 TRABAJO RECIBIDO: Cédula ${data.cedula}`);

                let browser;
                try {
                    browser = await puppeteer.launch({
                        headless: "new",
                        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                    });

                    const page = await browser.newPage();
                    
                    // ===========================================================
                    // 🚩 TU LÓGICA DE NAVEGACIÓN AQUÍ 🚩
                    // ===========================================================
                    console.log(`🌐 Navegando para: ${data.cedula}`);
                    
                    // Ejemplo:
                    // await page.goto('https://página-destino.com');
                    // ===========================================================

                    console.log(`✅ PROCESO COMPLETADO para: ${data.cedula}`);

                } catch (err) {
                    console.error(`❌ Error en Puppeteer:`, err.message);
                } finally {
                    if (browser) await browser.close();
                }
            }
        }
    } catch (error) {
        console.error("🚨 ERROR CRÍTICO:", error);
        setTimeout(iniciarWorker, 5000);
    }
}

iniciarWorker();
