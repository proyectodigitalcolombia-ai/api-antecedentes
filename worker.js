async function ejecutarConsulta(cedula) {
    // IMPORTANTE: Volvemos a HTTP. Webshare en puerto 80 prefiere HTTP.
    const proxyUrl = `${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
    
    console.log(`\n🤖 [Worker] Intentando conexión HTTP Proxy para CC: ${cedula}`);
    
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            `--proxy-server=http://${proxyUrl}` // Forzamos prefijo http://
        ]
    });

    const page = await browser.newPage();

    try {
        // Autenticación explícita (es más compatible con HTTP)
        await page.authenticate({
            username: process.env.PROXY_USER,
            password: process.env.PROXY_PASS
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(`📡 [Worker] Navegando a puerto 7005...`);
        
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'domcontentloaded', 
            timeout: 90000 
        });

        console.log(`✅ [${cedula}] ¡ENTRAMOS! Cargando contenido...`);

    } catch (e) {
        console.error(`❌ [${cedula}] Error final:`, e.message);
        
        // Si sale "Tunnel Connection Failed", intentaremos sin proxy solo para ver si la web de la policía responde
        if(e.message.includes('ERR_TUNNEL')) {
            console.log("⚠️ Webshare sigue rechazando el puerto 7005. Es un bloqueo del proveedor de proxy.");
        }
    } finally {
        await browser.close();
    }
}
