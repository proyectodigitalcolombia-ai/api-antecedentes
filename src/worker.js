const puppeteer = require('puppeteer');
const redis = require('redis');

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
            console.log(`📡 Esperando mensajes en la cola: [${NOMBRE_COLA}]...`);
            const registro = await client.blPop(NOMBRE_COLA, 0);
            
            if (registro) {
                const data = JSON.parse(registro.element);
                console.log(`🔎 TRABAJO RECIBIDO: Procesando cédula ${data.cedula}`);

                let browser;
                try {
                    browser = await puppeteer.launch({
                        headless: "new", // Esto quita el aviso de advertencia
                        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                    });

                    const page = await browser.newPage();
                    
                    // ===========================================================
                    // 🚩 PEGA TU LÓGICA DE NAVEGACIÓN AQUÍ ABAJO 🚩
                    // ===========================================================
                    
                    console.log(`🌐 Navegando para la cédula: ${data.cedula}`);
                    
                    // Ejemplo de lo que iría aquí:
                    // await page.goto('https://página-de-antecedentes.com');
                    // await page.type('#campo-cedula', data.cedula);
                    // await page.click('#boton-buscar');
                    
                    // ===========================================================
                    // 🚩 FIN DE TU LÓGICA 🚩
                    // ===========================================================

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
        setTimeout(iniciarWorker, 5000);
    }
}

iniciarWorker();
