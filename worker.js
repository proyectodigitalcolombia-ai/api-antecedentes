const puppeteer = require('puppeteer');
const redis = require('redis');

async function iniciarBot() {
    const client = redis.createClient({ url: process.env.REDIS_URL });
    client.on('error', err => console.log('❌ Redis Worker Error:', err));
    
    await client.connect();
    console.log('🤖 Bot conectado a Redis. Esperando tareas...');

    while (true) {
        try {
            // Sacamos la última cédula de la lista (bloquea hasta que haya una)
            const tarea = await client.brPop('cola_consultas', 0);
            const cedula = tarea.element;
            
            console.log(`🔎 Iniciando búsqueda para cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                executablePath: '/usr/bin/google-chrome',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });

            const page = await browser.newPage();
            
            // --- INICIO DE TU SCRAPPING ---
            await page.goto('https://www.google.com'); // Cambia por tu URL objetivo
            console.log(`✅ Proceso completado para ${cedula}`);
            // --- FIN DE TU SCRAPPING ---

            await browser.close();
        } catch (error) {
            console.error('⚠️ Error procesando tarea:', error);
        }
    }
}

iniciarBot();
