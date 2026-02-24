async function misionPolicia(cedula) {
    // Construimos la URL del proxy con el usuario y clave incluidos
    // Esto evita el error de "Tunnel Connection Failed"
    const proxyUrl = `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors',
            `--proxy-server=${proxyUrl}` // Inyectamos todo aquí
        ]
    });

    const page = await browser.newPage();

    try {
        console.log(`🇨🇴 Conectando a Policía con Proxy Rotativo...`);
        
        // Ya no necesitamos page.authenticate porque va en la URL
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 90000 
        });

        console.log("✅ ¡Túnel Abierto! Cargando formulario...");
        
        // ... (resto de tu lógica de captcha y nombre)
        
    } catch (e) {
        console.error("❌ Error de conexión:", e.message);
        return null;
    } finally {
        await browser.close();
    }
}
