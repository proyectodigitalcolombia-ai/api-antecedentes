const Bull = require('bull');
const puppeteer = require('puppeteer-core');
const cloudinary = require('cloudinary').v2;

cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });

const backgroundCheckQueue = new Bull('background-check-queue', process.env.REDIS_URL, {
    redis: {
        tls: { rejectUnauthorized: false },
        enableReadyCheck: false,
        maxRetriesPerRequest: null
    }
});

console.log('🤖 Bot iniciado. Esperando tareas de la API...');

backgroundCheckQueue.process(async (job) => {
    const { cedula } = job.data;
    console.log(`🔎 Buscando antecedentes para: ${cedula}`);

    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.goto('https://srvandroid.policia.gov.co/antecedentes/', { waitUntil: 'networkidle2', timeout: 60000 });

        await page.type('#documento', cedula);
        await page.click('#btnConsultar');

        await new Promise(r => setTimeout(r, 7000)); // Espera a que cargue la info
        const screenshot = await page.screenshot({ type: 'jpeg', quality: 60 });

        const upload = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: 'antecedentes', public_id: `cedula_${cedula}` },
                (error, result) => result ? resolve(result) : reject(error)
            );
            stream.end(screenshot);
        });

        console.log(`✅ Foto lista: ${upload.secure_url}`);
        return { url: upload.secure_url };

    } catch (err) {
        console.error(`❌ Error en el proceso: ${err.message}`);
        throw err;
    } finally {
        if (browser) await browser.close();
    }
});
