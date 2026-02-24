async function procesarConsulta(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });

        console.log('🌐 Navegando a la Policía...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2', timeout: 60000 
        });

        await new Promise(r => setTimeout(r, 5000));

        console.log('🎯 Buscando elementos físicamente...');
        
        // 1. MARCAR CHECKBOX (Por coordenadas)
        const checkbox = await page.$('input[type="checkbox"]');
        if (checkbox) {
            const box = await checkbox.boundingBox();
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            console.log('🖱️ Mouse click en Checkbox');
        }

        await new Promise(r => setTimeout(r, 2000));

        // 2. CLIC EN BOTÓN (Por coordenadas)
        const boton = await page.evaluateHandle(() => {
            return Array.from(document.querySelectorAll('button, input[type="submit"]'))
                .find(b => b.innerText.includes('Aceptar') || b.id.includes('continuar'));
        });

        if (boton) {
            const btnBox = await boton.asElement().boundingBox();
            if (btnBox) {
                await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
                console.log('🖱️ Mouse click en Botón Aceptar');
            }
        }

        // 3. INTENTO DE SALTO
        await page.keyboard.press('Enter');
        console.log('⏳ Esperando 10s para ver si el Captcha aparece...');
        await new Promise(r => setTimeout(r, 10000));

        // 4. VERIFICACIÓN Y CAPTCHA
        const captchaSelector = 'img[src*="captcha"], img[id*="cap"], img[src*="Servlet"]';
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 15000 });
        
        console.log('📸 Captcha encontrado! Procesando...');
        const screenshot = await captchaImg.screenshot({ encoding: 'base64' });
        const res = await solver.imageCaptcha(screenshot);
        
        // ... (Resto del código de llenado igual al anterior)
        await page.type('input[id*="cedula"]', cedula);
        await page.type('input[id*="captcha"]', res.data);
        await page.keyboard.press('Enter');
        
        await new Promise(r => setTimeout(r, 5000));
        const final = await page.evaluate(() => document.body.innerText.includes('No tiene asuntos') ? "LIMPIO" : "REVISAR");
        console.log(`🏁 RESULTADO: ${final}`);

    } catch (error) {
        const currentText = await page.evaluate(() => document.body.innerText.substring(0, 200));
        console.error(`❌ Error: ${error.message}. Texto actual: ${currentText}`);
    } finally {
        await browser.close();
    }
}
