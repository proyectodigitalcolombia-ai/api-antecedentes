async function ejecutarConsulta(cedula) {
    const proxyHost = `${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--ignore-certificate-errors', // Ignorar errores de certificado
            '--ignore-certificate-errors-spki-list',
            `--proxy-server=${proxyHost}`,
            '--proxy-bypass-list=<-loopback>' // Forzar que todo pase por el proxy
        ]
    });

    const page = await browser.newPage();

    try {
        await page.authenticate({
            username: process.env.PROXY_USER,
            password: process.env.PROXY_PASS
        });

        // Tip: Establecer un User Agent real ayuda a que el proxy no sea rechazado
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

        console.log(`\n🤖 [Worker] Intentando conexión con Proxy a Policía...`);
        
        // Intentamos cargar la página
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle0', // Esperar a que no haya tráfico de red
            timeout: 60000 
        });

        // ... resto del código de aceptar términos
