async function ejecutarConsulta(cedula) {
    // Usamos protocolo http (puerto 80) inyectando credenciales
    // Formato: http://usuario:password@p.webshare.io:80
    const proxyFullUrl = `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--ignore-certificate-errors',
            '--proxy-auth-extension', // Ayuda con la auth en algunos entornos
            `--proxy-server=${proxyFullUrl}`
        ]
    });

    const page = await browser.newPage();

    try {
        // Establecemos un User Agent bien moderno
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(`\n🤖 [Worker] Intentando acceso vía HTTP Proxy a Policía (CC: ${cedula})`);
        
        // El puerto 7005 es lento, le damos 90 segundos
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'domcontentloaded', 
            timeout: 90000 
        });

        // Esperar un segundo extra por si el sitio está lento
        await new Promise(r => setTimeout(r, 2000));

        await page.evaluate(() => {
            const ck = document.querySelector('input[type="checkbox"]');
            if (ck) ck.click();
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Aceptar'));
            if (btn) btn.click();
        });

        console.log(`✅ [${cedula}] ¡LOGRADO! El formulario está visible.`);

    } catch (e) {
        console.error(`❌ [${cedula}] Fallo en el Worker:`, e.message);
        
        // Si sale "Tunnel Connection Failed", es que el proxy bloquea el puerto 7005.
        if (e.message.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
            console.log("⚠️ Webshare está bloqueando el puerto 7005. Podrías necesitar un proxy que no filtre puertos.");
        }
    } finally {
        await browser.close();
        console.log(`🔒 [${cedula}] Navegador cerrado.`);
    }
}
