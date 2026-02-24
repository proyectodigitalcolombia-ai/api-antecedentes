const redis = require('redis');
const puppeteer = require('puppeteer');
const Captcha = require('2captcha');

// Configuración de 2Captcha y Redis
const solver = new Captcha.Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

client.on('error', (err) => console.log('Redis Client Error', err));

async function procesarCedula(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors',
            '--window-size=1920,1080'
        ]
    });

    const page = await browser.newPage();
    
    try {
        console.log(`🌐 Navegando a la página de la Policía para: ${cedula}`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // --- PASO 1: Aceptar Términos ---
        await page.waitForSelector('input[name="proximo.x"]', { timeout: 10000 });
        // En la web de la policía se usa un checkbox oculto o directo al botón dependiendo de la sesión
        const checkbox = await page.$('input[type="checkbox"]');
        if (checkbox) await checkbox.click();
        
        await page.click('input[name="proximo.x"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // --- PASO 2: Resolver Captcha ---
        console.log('📸 Capturando imagen del Captcha...');
        await page.waitForSelector('img[src*="vencaptcha"]');
        const captchaImg = await page.$('img[src*="vencaptcha"]');
        const base64Captcha = await captchaImg.screenshot({ encoding: 'base64' });

        console.log('🧠 Enviando a 2Captcha...');
        const result = await solver.imageCaptcha(base64Captcha);
        console.log(`✅ Captcha resuelto: ${result.data}`);

        // --- PASO 3: Llenar Formulario ---
        await page.type('#cedulaInput', cedula);
        await page.type('#captchaInput', result.data); // Asegúrate de que el ID sea correcto en el DOM actual
        
        // Clic en buscar (el botón suele ser un input type image)
        await page.click('input[name="consultar.x"]');
        
        // --- PASO 4: Extraer Resultado ---
        await page.waitForTimeout(3000); // Espera breve para renderizado
        const resultadoTexto = await page.evaluate(() => {
            const body = document.querySelector('body').innerText;
            return body.includes('NO TIENE ASUNTOS PENDIENTES') 
                ? 'SINDES: NO TIENE ASUNTOS PENDIENTES' 
                : 'REVISAR: Posible antecedente o error en consulta';
        });

        console.log(`📄 Resultado para ${cedula}: ${resultadoTexto}`);

    } catch (error) {
        console.error(`❌ Error procesando ${cedula}:`, error.message);
    } finally {
        await browser.close();
    }
}

async function iniciarBot() {
    await client.connect();
    console.log('🤖 Bot operativo con 2Captcha. Esperando tareas...');

    while (true) {
        try {
            const tarea = await client.blPop('cola_cedulas', 0);
            if (tarea) {
                await procesarCedula(tarea.element);
            }
        } catch (err) {
            console.error('Error en el bucle:', err);
        }
    }
}

iniciarBot();
