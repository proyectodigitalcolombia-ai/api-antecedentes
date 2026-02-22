const { createClient } = require('redis');
const puppeteer = require('puppeteer');

const client = createClient({
    url: process.env.REDIS_URL,
    socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) }
});

client.on('error', (err) => console.log('❌ Error en Redis Worker:', err));

async function ejecutarScraping(cedula) {
    console.log(`🤖 Iniciando navegación para la cédula: ${cedula}`);
    
    // Configuración optimizada para Render (Bajo consumo de RAM)
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // EJEMPLO: Ir a una página de prueba (Reemplaza con la real)
        await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });
        
        // Aquí irían tus pasos específicos:
        // await page.type('#id_del_input', cedula);
        // await page.click('#boton_buscar');

        console.log(`✅ Proceso terminado para: ${cedula}`);
        return true;

    } catch (error) {
        console.error(`❌ Error navegando para ${cedula}:`, error.message);
    } finally {
        await browser.close(); // Cerramos SIEMPRE para liberar RAM
    }
}

async function iniciarWorker() {
    try {
        await client.connect();
        console.log('✅ Bot conectado a Redis y esperando tareas...');

        while (true) {
            try {
                // brPop espera hasta que llegue una cédula (bloqueo 0 = infinito)
                const tareaRaw = await client.brPop('tareas_antecedentes', 0);
                
                if (tareaRaw) {
                    const datos = JSON.parse(tareaRaw.element);
                    await ejecutarScraping(datos.cedula);
                }
            } catch (err) {
                console.error('❌ Error en el bucle del Worker:', err);
            }
        }
    } catch (err) {
        console.error('🚀 Error crítico en el Worker:', err);
        setTimeout(iniciarWorker, 5000);
    }
}

iniciarWorker();
