// 1. GESTIÓN DE TÉRMINOS (Versión Reforzada)
        await new Promise(r => setTimeout(r, 5000));
        
        const pantallaTerminos = await page.evaluate(() => document.body.innerText.includes('Términos de uso'));

        if (pantallaTerminos) {
            console.log('📝 Ejecutando secuencia de aceptación forzada...');
            
            await page.evaluate(() => {
                const ck = document.querySelector('input[type="checkbox"]');
                if (ck) {
                    ck.checked = true;
                    // Disparamos eventos manuales para que la página reaccione
                    ck.dispatchEvent(new Event('change', { bubbles: true }));
                    ck.dispatchEvent(new Event('click', { bubbles: true }));
                }
            });

            await new Promise(r => setTimeout(r, 2000));

            // Intentamos hacer clic en el botón usando su clase o ID
            await page.evaluate(() => {
                const botones = Array.from(document.querySelectorAll('button, input[type="submit"], .ui-button'));
                const btnAceptar = botones.find(b => 
                    b.innerText.includes('Aceptar') || 
                    b.value?.includes('Aceptar') || 
                    b.id.includes('continuar')
                );
                if (btnAceptar) {
                    btnAceptar.focus();
                    btnAceptar.click();
                }
            });

            // Refuerzo final con la tecla Enter por si el clic falló
            await page.keyboard.press('Enter');
            
            console.log('⏳ Esperando salto al Captcha (10s)...');
            await new Promise(r => setTimeout(r, 10000));
        }
