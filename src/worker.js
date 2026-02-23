const { createClient } = require('redis');
const puppeteer = require('puppeteer');

const client = createClient({
    url: process.env.REDIS_URL
});

client.on('error', (err) => console.log('❌ Error en Redis Worker:', err));

async function consultarEnWeb(cedula) {
    console.log(`🔎 [BOT] Iniciando scraping para: ${cedula}`);
    
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
        
        // --- LÓGICA DE SCRAPING EN HACKER NEWS ---
        console.log(`🌐 Navegando a Hacker News...`);
        await page.goto('https://news.ycombinator.com', { waitUntil: 'networkidle2', timeout: 60000 });

        // Extraemos el título de la primera noticia como prueba
        const primerTitulo = await page.evaluate(() => {
            const enlace = document.querySelector('.titleline > a');
            return enlace ? enlace.innerText : 'No se encontró el título';
        });

        console.log(`✅ Resultado para ${cedula}: La noticia top es "${primerTitulo}"`);
        // -----------------------------------------

    } catch (error) {
        console.error(`❌ Error en Puppeteer para ${cedula}:`, error.message);
    } finally {
        await browser.close();
        console.log(`☁️ Navegador cerrado y RAM liberada.`);
    }
}

async function iniciarWorker() {
    try {
        await client.connect();
        console.log('🤖 BOT ONLINE: Esperando tareas de la API...');

        while (true) {
            // brPop espera (bloquea) hasta que llegue algo a la lista
            const tareaRaw = await client.brPop('tareas_antecedentes', 0);
            
            if (tareaRaw) {
                const { cedula } = JSON.parse(tareaRaw.element);
                await consultarEnWeb(cedula);
            }
        }
    } catch (err) {
        console.error('🚀 Error crítico en el Worker:', err);
        setTimeout(iniciarWorker, 5000);
    }
}

iniciarWorker();
