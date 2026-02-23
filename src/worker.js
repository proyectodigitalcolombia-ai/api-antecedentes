const { createClient } = require('redis');
const puppeteer = require('puppeteer');

const client = createClient({
    url: process.env.REDIS_URL
});

client.on('error', (err) => console.log('❌ Error en Redis Worker:', err));

async function ejecutarScraping(cedula) {
    console.log(`🤖 [BOT] Procesando consulta para la cédula: ${cedula}`);
    
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
        
        // Bloqueamos imágenes y CSS para ahorrar RAM en Render
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // NAVEGACIÓN REAL
        console.log(`🌐 Navegando a la página de prueba...`);
        await page.goto('https://news.ycombinator.com', { waitUntil: 'networkidle2', timeout: 60000 });

        // EXTRACCIÓN DE DATOS
        const noticiaTop = await page.evaluate(() => {
            const el = document.querySelector('.titleline > a');
            return el ? el.innerText : 'No se encontró información';
        });

        console.log(`✅ Resultado para ${cedula}: Noticia Top -> "${noticiaTop}"`);

    } catch (error) {
        console.error(`❌ Error en Puppeteer para ${cedula}:`, error.message);
    } finally {
        await browser.close();
        console.log(`✅ Finalizado proceso de cédula: ${cedula}`);
    }
}

async function iniciarWorker() {
    try {
        await client.connect();
        console.log('✅ Bot conectado y esperando tareas...');

        while (true) {
            // Esperar tarea de Redis (bloqueo infinito hasta que llegue algo)
            const tareaRaw = await client.brPop('tareas_antecedentes', 0);
            
            if (tareaRaw) {
                const { cedula } = JSON.parse(tareaRaw.element);
                await ejecutarScraping(cedula);
            }
        }
    } catch (err) {
        console.error('🚀 Error crítico en el Worker:', err);
        setTimeout(iniciarWorker, 5000); // Reintento en caso de caída
    }
}

iniciarWorker();
