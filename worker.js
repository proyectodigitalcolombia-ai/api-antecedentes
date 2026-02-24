// 1. ACEPTAR TÉRMINOS (Lógica Reforzada)
        console.log('📝 Intentando marcar checkbox y aceptar...');
        try {
            await page.evaluate(() => {
                // Seleccionamos el checkbox de términos (usualmente tiene "acepto" en el ID)
                const check = document.querySelector('input[type="checkbox"]');
                if (check) {
                    check.click();
                }
                
                // Buscamos el botón "Continuar" o "Aceptar"
                // En la Policía suele ser un botón con id que termina en 'continuarBtn' o similar
                const botones = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                const btnAceptar = botones.find(b => 
                    b.innerText.toLowerCase().includes('aceptar') || 
                    b.value?.toLowerCase().includes('aceptar') ||
                    b.id.includes('continuar')
                );
                
                if (btnAceptar) btnAceptar.click();
            });

            // Si el clic por JS no funcionó, forzamos un Enter físico
            await new Promise(r => setTimeout(r, 2000));
            await page.keyboard.press('Enter');
            
            console.log('⏳ Esperando carga del formulario...');
            await new Promise(r => setTimeout(r, 6000));
        } catch (e) {
            console.log('⚠️ Error al interactuar con términos, intentando seguir...');
        }

        // 2. RESOLVER CAPTCHA (Selector flexible)
        console.log('📸 Capturando Captcha...');
        // El ID real suele ser algo como 'formAntecedentes:captchaImg'
        const captchaSelector = 'img[src*="captcha"], img[id*="cap"]';
        const captchaImg = await page.waitForSelector(captchaSelector, { timeout: 25000 });
