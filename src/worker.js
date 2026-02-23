const { createClient } = require('redis');
const puppeteer = require('puppeteer');

const client = createClient({
    url: process.env.REDIS_URL
});

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
        
        // --- AQUÍ IRÁ LA LÓGICA DE CADA PÁGINA ---
        await page.goto('https://www.google.com'); 
        // -----------------------------------------

        console.log(`✅ Proceso completado para: ${cedula}`);
    } catch (error) {
        console.error(`❌ Error en Puppeteer:`, error.message);
    } finally {
        await browser.close();
    }
}

async function iniciarWorker() {
    try {
        await client.connect();
        console.log('✅ Bot conectado y esperando tareas...');

        while (true) {
            const tareaRaw = await client.brPop('tareas_antecedentes', 0);
            if (tareaRaw) {
                const { cedula } = JSON.parse(tareaRaw.element);
                await consultarEnWeb(cedula);
            }
        }
    } catch (err) {
        console.error('🚀 Error en Worker:', err);
        setTimeout(iniciarWorker, 5000);
    }
}

iniciarWorker();
