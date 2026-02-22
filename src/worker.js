const { createClient } = require('redis');
const puppeteer = require('puppeteer');

const client = createClient({
    url: process.env.REDIS_URL,
    socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) }
});

client.on('error', (err) => console.log('❌ Error Redis:', err));

async function consultarAntecedentes(cedula) {
    console.log(`🔎 Iniciando búsqueda en la web para: ${cedula}`);
    
    // Configuracion necesaria para que Puppeteer corra en Render
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        
        // 1. Ir a la página (Cambia el URL por el real)
        await page.goto('https://url-de-la-pagina-de-antecedentes.com', { waitUntil: 'networkidle2' });

        // 2. Escribir la cédula
        // Ajusta el selector 'input[name="cedula"]' según la página real
        await page.type('#numero_documento', cedula); 
        
        // 3. Click en buscar
        await page.click('#btn-buscar');

        // 4. Esperar el resultado
        await page.waitForTimeout(3000); 

        // 5. Ejemplo: Tomar captura de pantalla
        const screenshot = await page.screenshot({ encoding: "base64" });
        console.log(`📸 Captura tomada para ${cedula}`);

        // AQUÍ LUEGO SUBIREMOS A CLOUDINARY
        return "Proceso completado con éxito";

    } catch (error) {
        console.error(`❌ Error en Puppeteer para ${cedula}:`, error.message);
    } finally {
        await browser.close();
    }
}

async function iniciar() {
    await client.connect();
    console.log('✅ Bot conectado y listo para Puppeteer');

    while (true) {
        try {
            const tareaRaw = await client.brPop('tareas_antecedentes', 0);
            if (tareaRaw) {
                const datos = JSON.parse(tareaRaw.element);
                await consultarAntecedentes(datos.cedula);
            }
        } catch (err) {
            console.error('Error en el bucle:', err);
        }
    }
}

iniciar();
