const { createClient } = require('redis');
const puppeteer = require('puppeteer');

const client = createClient({
    url: process.env.REDIS_URL
});

client.on('error', (err) => console.log('❌ Error en Redis Worker:', err));

async function consultarEnWeb(cedula) {
    console.log(`🔎 Iniciando búsqueda para: ${cedula}`);
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // --- PRUEBA INICIAL ---
        await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });
        console.log(`✅ Página cargada correctamente para: ${cedula}`);
        // -----------------------

    } catch (error) {
        console.error(`❌ Error en Puppeteer para ${cedula}:`, error.message);
    } finally {
        await browser.close();
        console.log(`Navegador cerrado para ${cedula}`);
    }
}

async function iniciarWorker() {
    try {
        await client.connect();
        console.log('✅ Bot conectado y esperando tareas...');

        while (true) {
            // brPop espera una tarea de la lista 'tareas_antecedentes'
            const tareaRaw = await client.brPop('tareas_antecedentes', 0);
            if (tareaRaw) {
                const { cedula } = JSON.parse(tareaRaw.element);
                await consultarEnWeb(cedula);
            }
        }
    } catch (err) {
        console.error('🚀 Error crítico en el Worker:', err);
        // Reintento automático en 5 segundos si falla la conexión
        setTimeout(iniciarWorker, 5000);
    }
}

iniciarWorker();
