const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');

// --- ⚙️ CONFIGURACIÓN DESDE VARIABLES DE ENTORNO ---
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = process.env.API_KEY_2CAPTCHA; // Ahora lee la variable de Render
const client = createClient({ url: REDIS_URL });

/**
 * 🧩 RESOLVER CAPTCHA (2Captcha)
 */
async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando reCAPTCHA...");
        const siteKey = await page.evaluate(() => {
            const el = document.querySelector('.g-recaptcha');
            return el ? el.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) throw new Error("No se encontró SiteKey en el portal");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        
        // Enviar a 2Captcha
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        if (resp.data.status !== 1) throw new Error(`Error 2Captcha In: ${resp.data.request}`);
        
        const requestId = resp.data.request;
        console.log(`⏳ Esperando solución (ID: ${requestId})...`);

        // Bucle de espera por la solución
        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            
            if (check.data.status === 1) {
                console.log("✅ Captcha resuelto con éxito");
                return check.data.request;
            }
            if (check.data.request !== 'CAPCHA_NOT_READY') {
                throw new Error(`Error 2Captcha Res: ${check.data.request}`);
            }
        }
    } catch (e) {
        throw new Error("Fallo en Captcha: " + e.message);
    }
}

/**
 * 🤖 LÓGICA DE SCRAPING (ANTECEDENTES)
 */
async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 PROCESANDO CÉDULA: ${cedula} ---`);

        browser = await puppeteer.launch({
            executablePath: '/usr/bin/google-chrome', // Ruta fija en Docker
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log("🔗 Abriendo portal de la Policía...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 1. Click en el botón Continuar inicial
        await page.waitForSelector('#continuarBtn', { visible: true });
        await page.click('#continuarBtn');
        
        // 2. Llenar los campos de la cédula
        await page.waitForSelector('#form\\:cedulaInput', { visible: true });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1'); // 1 suele ser Cédula de Ciudadanía

        // 3. Resolver y aplicar Captcha
        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            const el = document.getElementById('g-recaptcha-response');
            if (el) el.innerHTML = t;
        }, token);

        console.log("🛰️ Enviando consulta final...");
        await page.click('#form\\:consultarBtn');
        
        // 4. Esperar resultado (panelResultado es donde sale si tiene antecedentes o no)
        await page.waitForSelector('#form\\:panelResultado', { timeout: 35000 });
        const resultado = await page.evaluate(() => document.querySelector('#form\\:panelResultado').innerText);

        console.log("📄 Resultado capturado correctamente.");
        
        // Guardar en Redis para que tu API lo recoja
        await client.set(`resultado:${cedula}`, JSON.stringify({ 
            cedula, 
            resultado: resultado.trim(), 
            fecha: new Date().toISOString() 
        }), { EX: 3600 });

    } catch (e) {
        console.error(`❌ ERROR EN EL PROCESO: ${e.message}`);
        await client.set(`resultado:${cedula}`, JSON.stringify({ error: e.message }), { EX: 300 });
    } finally {
        if (browser) await browser.close();
        console.log(`--- 🏁 FIN DE CONSULTA ---`);
