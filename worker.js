const express = require('express'); // Necesario para mantener vivo a Render
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// ... resto de tus imports

// 1. MANTENER VIVO EL SERVICIO EN RENDER
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Worker está vivo 🤖'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Servidor de salud activo en puerto ${PORT}`));

// 2. CONFIGURACIÓN MEJORADA DEL NAVEGADOR
async function misionPolicia(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors', // Ignorar errores de certificados del Gob
            `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
        ]
    });
    const page = await browser.newPage();
    
    // Autenticación explícita
    await page.authenticate({
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS
    });

    try {
        // Aumentamos el tiempo de espera a 90 segundos porque la web de la Policía es lenta
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 90000 
        });

        // ... resto de tu lógica de captcha y nombres
    } catch (e) {
        console.error("❌ Detalle del error:", e.message);
        return null;
    } finally {
        await browser.close();
    }
}
