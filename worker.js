const puppeteer = require('puppeteer');
const redis = require('redis');

async function iniciarBot() {
    const client = redis.createClient({ url: process.env.REDIS_URL });
    client.on('error', err => console.log('Redis Error', err));
    await client.connect();

    console.log('🤖 Bot conectado a Redis y esperando tareas...');

    while (true) {
        try {
            // Sacamos una cédula de la lista (bloquea hasta que haya una)
            const { element: cedula } = await client.brPop('cola_consultas', 0);
            console.log(`🔎 Procesando cédula: ${cedula}`);

            const browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            const page = await browser.newPage();
            // --- AQUÍ IRÁ TU LÓGICA DE SCRAPPING ---
            await page.goto('https://www.google.com'); // Ejemplo
            console.log(`✅ Finalizado proceso para: ${cedula}`);
            
            await browser.close();
        } catch (error) {
            console.error('❌ Error en el bot:', error);
        }
    }
}

iniciarBot();
