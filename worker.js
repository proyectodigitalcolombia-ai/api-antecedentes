const puppeteer = require('puppeteer');
const redis = require('redis');
const { Solver } = require('2captcha');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health Check activo`));

const solver = new Solver(process.env.API_KEY_2CAPTCHA);
const client = redis.createClient({ url: process.env.REDIS_URL });

async function ejecutarServicio() {
    try {
        await client.connect();
        console.log('🤖 Bot listo y escuchando cola de Redis...');

        while (true) {
            try {
                const tarea = await client.brPop('cola_consultas', 0);
                if (tarea) {
                    const { cedula } = JSON.parse(tarea.element);
                    console.log(`\n🔎 CONSULTANDO: ${cedula}`);
                    await procesarConsulta(cedula);
                }
            } catch (err) {
                console.error('❌ Error en ciclo:', err.message);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    } catch (err) {
        console.error('❌ Error conexión Redis:', err);
    }
}

async function procesarConsulta(cedula) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
        ]
    });
    
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1366, height: 768 });

        console.log('🌐 Navegando a la Policía...');
        await page.goto('https://antecedentes.policia.gov.co:7005/WebJudicial/antecedentes.xhtml', {
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // --- 1. GESTIÓN DE TÉRMINOS FORZADA ---
        await new Promise(r => setTimeout(r, 5000));
        const tieneTerminos = await page.evaluate(() => document.body.innerText.includes('Términos de uso'));

        if (tieneTerminos) {
            console.log('📝 Ejecutando secuencia de aceptación forzada...');
            
            await page.evaluate(() => {
                const ck = document.querySelector('input[type="checkbox"]');
                if (ck) {
                    ck.checked = true;
                    // Forzamos eventos de PrimeFaces
                    ck.dispatchEvent(new Event('change', { bubbles: true }));
                    ck.dispatchEvent(new Event('click', { bubbles: true }));
                }
                
                const botones = Array.from(document.querySelectorAll('button, input[type="submit"], .ui-button'));
                const btnAceptar = botones.find(b => 
                    b.innerText.toLowerCase().includes('aceptar') || 
                    b.value?.toLowerCase().includes('aceptar') || 
                    b.id.toLowerCase().includes('continuar')
                );
                
                if (btnAceptar) {
                    btnAceptar.focus();
                    btnAceptar.click();
                }
            });

            // Refuerzo con teclado físico simulado
            await new Promise(r => setTimeout(r, 1000));
            await page.keyboard.press('Enter');
            
            console.log('⏳
