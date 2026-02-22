const { createClient } = require('redis');
const puppeteer = require('puppeteer');

const client = createClient({
    url: process.env.REDIS_URL,
    socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) }
});

// --- DEFINICIÓN DE SCRAPERS POR ENTIDAD ---

const scrapers = {
    policia: async (page, cedula) => {
        await page.goto('https://srvis.policia.gov.co/antecedentes/', { waitUntil: 'networkidle2' });
        // Lógica específica para Policía...
        console.log(`[Policía] Consultando ${cedula}`);
    },
    procuraduria: async (page, cedula) => {
        await page.goto('https://www.procuraduria.gov.co/portal/index.jsp?option=co.gov.procuraduria.portal.servicios.antecedentes', { waitUntil: 'networkidle2' });
        // Lógica específica para Procuraduría...
        console.log(`[Procuraduría] Consultando ${cedula}`);
    }
};

// --- FUNCIÓN PRINCIPAL DE PROCESAMIENTO ---

async function procesarConsultaCompleta(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        
        // Ejecutar todos los scrapers en orden
        await scrapers.policia(page, cedula);
        await scrapers.procuraduria(page, cedula);
        
        // Al final, aquí es donde generarías el PDF o subirías a Cloudinary
        console.log(`✅ Todas las entidades consultadas para: ${cedula}`);

    } catch (error) {
        console.error(`❌ Error general procesando ${cedula}:`, error);
    } finally {
        await browser.close();
    }
}

// --- CONEXIÓN Y BUCLE ---

async function iniciar() {
    await client.connect();
    console.log('✅ Bot Multientidad conectado y listo');

    while (true) {
        try {
            const tareaRaw = await client.brPop('tareas_antecedentes', 0);
            if (tareaRaw) {
                const datos = JSON.parse(tareaRaw.element);
                await procesarConsultaCompleta(datos.cedula);
            }
        } catch (err) {
            console.error('Error en el bucle:', err);
        }
    }
}

iniciar();
