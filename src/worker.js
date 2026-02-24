const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { execSync } = require('child_process');

// --- ⚙️ CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';
const client = createClient({ url: REDIS_URL });

/**
 * BUSCADOR DE EMERGENCIA 🔍
 * Si Puppeteer no encuentra Chrome, este comando de Linux lo rastrea físicamente.
 */
function buscarEjecutableChrome() {
    try {
        // Ruta que nos dio el log exitoso
        const rutaLog = '/opt/render/project/src/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';
        if (fs.existsSync(rutaLog)) return rutaLog;

        // Si no está ahí, rastreamos cualquier ejecutable de chrome en el proyecto
        console.log("⚠️ Ruta estándar no hallada, rastreando disco...");
        const hallazgo = execSync("find /opt/render/project/src -type f -name chrome | grep 'chrome-linux64/chrome' | head -n 1").toString().trim();
        return hallazgo || null;
    } catch (e) {
        return null;
    }
}

async function resolverCaptcha(page) {
    try {
        console.log("🧩 Obteniendo SiteKey para 2Captcha...");
        const siteKey = await page.evaluate(() => {
            const el = document.querySelector('.g-recaptcha');
            return el ? el.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) throw new Error("No se encontró SiteKey");

        const pageUrl = 'https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml';
        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        
        const requestId = resp.data.request;
        console.log(`⏳ Resolviendo Captcha (ID: ${requestId})...`);

        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) return check.data.request;
            if (check.data.request !== 'CAPCHA_NOT_READY') throw new Error(check.data.request);
        }
    } catch (e) {
        throw new Error("Fallo en Captcha: " + e.message);
    }
}

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA: ${cedula} ---`);

        const rutaReal = buscarEjecutableChrome();
        
        if (rutaReal) {
            console.log(`🎯 CHROME LOCALIZADO EN: ${rutaReal}`);
        } else {
            console.log("❌ ERROR: No se encontró el ejecutable de Chrome en el servidor.");
        }

        browser = await puppeteer.launch({
            executablePath: rutaReal || undefined,
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

        console.log("🔗 Navegando a la Policía Nacional...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Paso 1: Aceptar términos
        await page.waitForSelector('#continuarBtn', { visible: true });
        await page.click('#continuarBtn');
        
        // Paso 2: Digitar Cédula
        await page.waitForSelector('#form\\:cedulaInput', { visible: true });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');

        // Paso 3: Resolver Captcha
        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            const el = document.getElementById('g-recaptcha-response');
            if (el) el.innerHTML = t;
        }, token);

        // Paso 4: Consultar
        await page.click('#form\\:consultarBtn');
        console.log("🛰️ Procesando respuesta...");
        
        await page.waitForSelector('#form\\:panelResultado', { timeout: 35000 });
        const resultado = await page
