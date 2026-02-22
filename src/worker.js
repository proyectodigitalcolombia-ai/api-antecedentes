const Bull = require('bull');
const puppeteer = require('puppeteer-core');
const cloudinary = require('cloudinary').v2;

// 1. Configuración de Cloudinary
cloudinary.config({
  cloudinary_url: process.env.CLOUDINARY_URL
});

// 2. Configuración de la cola con soporte para Redis en Render (TLS)
const backgroundCheckQueue = new Bull('background-check-queue', process.env.REDIS_URL, {
    redis: {
        tls: {
            rejectUnauthorized: false
        }
    }
});

console.log('🚀 Bot de Antecedentes iniciado y esperando tareas...');

backgroundCheckQueue.process(async (job) => {
    const { cedula } = job.data;
    console.log(`🔎 Procesando cédula: ${cedula}`);

    let browser;
    try {
        // 3. Lanzar Navegador
        browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        
        // Simular un navegador real
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // 4. Navegar a la página de la Policía
        console.log('🌐 Accediendo a la página de la Policía...');
        await page.goto('https://srvandroid.policia.gov.co/antecedentes/', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 5. Interactuar con la página
        // Nota: Si la página tiene un checkbox de "Acepto", intentamos marcarlo
        const checkbox = await page.$('#aceptaTerminos');
        if (checkbox) await checkbox.click();

        await page.type('#documento', cedula);
        await page.click('#btnConsultar');

        // Esperamos un momento a que cargue el resultado
        await new Promise(r => setTimeout(r, 5000));

        // 6. Tomar captura de pantalla
        console.log('📸 Tomando captura de pantalla...');
        const screenshot = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 80 });

        // 7. Subir a Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { 
                    folder: 'antecedentes', 
                    public_id: `resultado_${cedula}_${Date.now()}` 
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(screenshot);
        });

        console.log(`✅ ¡Éxito! Foto guardada en: ${uploadResult.secure_url}`);
        return { url: uploadResult.secure_url };

    } catch (error) {
        console.error(`❌ Error procesando ${cedula}:`, error.message);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
});
