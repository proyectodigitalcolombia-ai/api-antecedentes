const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const redis = require('redis');
const express = require('express');

// Activar sigilo
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health Check en puerto ${PORT}`));

const client = redis.createClient({ url: process.env.REDIS_URL });

async function ejecutarPrueba() {
    try {
        await client.connect();
        console.log('🤖 Bot de PRUEBA iniciado. Esperando tarea en Redis...');

        while (true) {
            try {
                const tarea = await client.brPop('cola_consultas', 0);
                if (tarea) {
                    console.log(`\n🚀 Tarea recibida. Iniciando prueba de navegación...`);
                    await realizarNavegacionDePrueba();
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

async function realizarNavegacionDePrueba() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    try {
        console.log('🌐 Navegando a quotes.toscrape.com...');
        await page.goto('https://quotes.toscrape.com/', {
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });

        // Extraer la primera frase de la página
        const datos = await page.evaluate(() => {
            const frase = document.querySelector('.text')?.innerText;
            const autor = document.querySelector('.author')?.innerText;
            return { frase, autor };
        });

        console.log('------------------------------------------');
        console.log('✅ ¡CONEXIÓN EXITOSA!');
        console.log(`📝 Cita leída: "${datos.frase}"`);
        console.log(`👤 Autor: ${datos.autor}`);
        console.log('------------------------------------------');

    } catch (error) {
        console.error(`❌ La prueba falló: ${error.message}`);
    } finally {
        await browser.close();
        console.log('📦 Navegador cerrado.');
    }
}

ejecutarPrueba();
