async function procesarConsulta(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });

        console.log('🌐 Navegando a WebJudicial...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2', timeout: 60000 
        });

        console.log('🕵️ Iniciando secuencia de teclado para términos...');
        
        // Esperamos un poco a que cargue todo
        await new Promise(r => setTimeout(r, 5000));

        // TÉCNICA DE TECLADO: 
        // 1. Presionamos TAB varias veces para llegar al checkbox (suele ser el primer o segundo elemento interactivo)
        await page.keyboard.press('Tab');
        await new Promise(r => setTimeout(r, 200) );
        await page.keyboard.press('Tab');
        await new Promise(r => setTimeout(r, 200) );
        
        // 2. Presionamos ESPACIO (para marcar el checkbox)
        await page.keyboard.press('Space');
        console.log('⌨️ Espacio presionado (Checkbox)...');
        await new Promise(r => setTimeout(r, 500) );

        // 3. Presionamos TAB otra vez para llegar al botón de aceptar
        await page.keyboard.press('Tab');
        await new Promise(r => setTimeout(r, 500) );

        // 4. Presionamos ENTER
        await page.keyboard.press('Enter');
        console.log('⌨️ Enter presionado (Enviar)...');

        console.log('⏳ Esperando transición (10s)...');
        await new Promise(r => setTimeout(r, 10000));

        // --- BUSCAR CAPTCHA ---
        console.log('🧠 Buscando Captcha...');
        const captchaSelector = 'img[src*="captcha"], img[id*="cap"], img[id*="Captcha"]';
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 20000 });

        console.log('📸 Capturando Captcha...');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const res = await solver.imageCaptcha(screenshot);
        
        // --- LLENAR FORMULARIO (También por teclado para asegurar) ---
        // Después de aceptar términos, el foco suele quedar en el primer campo (Cédula)
        await page.type('input[id*="cedula"]', cedula);
        await page.keyboard.press('Tab');
        await page.keyboard.type(res.data);
        await page.keyboard.press('Enter');

        console.log('🚀 Consulta enviada. Esperando resultado...');
        await new Promise(r => setTimeout(r, 8000));

        const resultado = await page.evaluate(() => {
            const body = document.body.innerText;
            if (body.includes('No tiene asuntos pendientes')) return "LIMPIO";
            if (body.includes('registra antecedentes')) return "CON ANTECEDENTES";
            return "RESULTADO NO ENCONTRADO";
        });

        console.log(`🏁 RESULTADO: ${cedula} -> ${resultado}`);

    } catch (error) {
        console.error(`❌ Fallo: ${error.message}`);
    } finally {
        await browser.close();
    }
}
