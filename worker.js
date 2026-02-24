async function ejecutarConsulta(cedula) {
    console.log(`\n🔎 [${cedula}] Interactuando con el sitio de la Policía...`);
    
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        // 1. Ir a la página
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 2. Esperar y hacer clic en el checkbox de "Acepto"
        console.log(`⏳ Esperando checkbox de términos...`);
        await page.waitForSelector('input[type="checkbox"]', { timeout: 10000 });
        await page.click('input[type="checkbox"]');
        
        // 3. Hacer clic en el botón "Aceptar" (usualmente es el botón principal)
        await page.keyboard.press('Enter'); 
        
        // Esperamos un momento a que cargue el formulario de cédula
        await new Promise(r => setTimeout(r, 3000));

        // 4. Tomar captura del formulario real
        if (!fs.existsSync('./capturas')) fs.mkdirSync('./capturas');
        await page.screenshot({ path: `./capturas/${cedula}.png`, fullPage: true });

        console.log(`✅ [${cedula}] Formulario alcanzado. Revisa la captura.`);

    } catch (e) {
        console.error(`❌ [${cedula}] Error en interacción: ${e.message}`);
        // Si falla, tomamos captura del error para ver qué vio el bot
        await page.screenshot({ path: `./capturas/error_${cedula}.png` });
    } finally {
        await browser.close();
    }
}
