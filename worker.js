const redis = require('redis');
const puppeteer = require('puppeteer');
const Captcha = require('2captcha');

const solver = new Captcha.Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

client.on('error', (err) => console.log('❌ Redis Error:', err));

async function procesarCedula(cedula) {
    console.log(`\n🔎 --- NUEVA TAREA: ${cedula} ---`);
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors',
            '--disable-web-security'
        ]
    });

    const page = await browser.newPage();
    // Tiempo de espera largo porque el servidor de la policía es lento
    page.setDefaultNavigationTimeout(90000); 

    try {
        console.log(`🌐 Entrando a la web de la Policía (Puerto 7005)...`);
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/', { 
            waitUntil: 'networkidle2' 
        });

        // --- PASO 1: Aceptar Términos ---
        console.log("📝 Esperando pantalla de términos...");
        await page.waitForSelector('input[type="checkbox"]', { timeout: 20000 });
        await page.click('input[type="checkbox"]');
        
        // Clic en el botón Continuar (usando múltiples selectores por si cambia)
        const btnContinuar = await page.$('input[name="proximo.x"]') || await page.$('#continuarBtn');
        await btnContinuar.click();
        
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log("✅ Términos aceptados.");

        // --- PASO 2: Captcha ---
        console.log("📸 Buscando Captcha...");
        const captchaImg = await page.waitForSelector('img[src*="vencaptcha"]', { timeout: 20000 });
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });

        console.log('🧠 Resolviendo con 2Captcha...');
        const result = await solver.imageCaptcha(screenshot);
        console.log(`✅ Captcha resuelto: ${result.data}`);

        // --- PASO 3: Formulario ---
        // Esperamos a que el input de cédula esté listo
        await page.waitForSelector('#cedulaInput', { timeout: 10000 });
        await page.type('#cedulaInput', cedula);
        await page.type('#captchaInput', result.data);
        
        console.log("🚀 Enviando consulta final...");
        await page.click('input[name="consultar.x"]');

        // --- PASO 4: Leer Resultado ---
        await page.waitForTimeout(5000); // Espera a que cargue el resultado
        const contenido = await page.evaluate(() => document.body.innerText);
        
        if (contenido.includes('NO TIENE ASUNTOS PENDIENTES')) {
            console.log(`🟢 RESULTADO PARA ${cedula}: SIN ANTECEDENTES`);
        } else if (contenido.includes('ERROR') || contenido.includes('incorrecto')) {
            console.log(`🟠 RESULTADO PARA ${cedula}: Error en datos o captcha.`);
        } else {
            console.log(`🔴 RESULTADO PARA ${cedula}: REVISAR DETALLADAMENTE (Posible registro).`);
        }

    } catch (error) {
        console.error(`❌ Fallo en el proceso: ${error.message}`);
    } finally {
        await browser.close();
        console.log(`🏁 Sesión cerrada para ${cedula}`);
    }
}

async function iniciarBot() {
    await client.connect();
    console.log('🤖 Bot operativo con 2Captcha y conectado a Redis');
    
    while (true) {
        try {
            // Escucha la cola 'cola_consultas' de forma infinita
            const tarea = await client.blPop('cola_consultas', 0);
            if (tarea) {
                await procesarCedula(tarea.element);
            }
        } catch (err) {
            console.error('Error en el bucle principal:', err);
            await new Promise(r => setTimeout(r, 5000)); // Espera 5s antes de reintentar si falla Redis
        }
    }
}

iniciarBot();
