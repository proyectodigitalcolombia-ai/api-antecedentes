const Bull = require('bull');
const puppeteer = require('puppeteer-core');
const cloudinary = require('cloudinary').v2;

// Configuración Cloudinary
cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });

// Configuración Redis (Igual a la del server)
const backgroundCheckQueue = new Bull('background-check-queue', process.env.REDIS_URL, {
    redis: {
        tls: { rejectUnauthorized: false },
        enableReadyCheck: false,
        maxRetriesPerRequest: null
    }
});

console.log('🤖 Bot esperando tareas...');

backgroundCheckQueue.process(async (job) => {
    const { cedula } = job.data;
    console.log(`🔎 Procesando: ${cedula}`);

    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);

        // Ir a la página
        await page.goto('https://srvandroid.policia.gov.co/antecedentes/', { waitUntil: 'networkidle2' });

        // Escribir cédula y buscar
        await page.type('#documento', cedula);
        await page.click('#btnConsultar');

        // Esperar resultado y capturar
        await new Promise(r => setTimeout(r, 6000));
        const screenshot = await page.screenshot({ type: 'jpeg', quality: 60 });

        // Subir a Cloudinary
        const upload = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: 'antecedentes', public_id: `cedula_${cedula}` },
                (error, result) => result ? resolve(result) : reject(error)
            );
            stream.end(screenshot);
        });

        console.log(`✅ Resultado: ${upload.secure_url}`);
        return { url: upload.secure_url };

    } catch (err) {
        console.error(`❌ Error en bot: ${err.message}`);
        throw err;
    } finally {
        if (browser) await browser.close();
    }
});
