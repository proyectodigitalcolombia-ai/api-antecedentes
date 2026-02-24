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
 * 🔍 BUSCADOR DE EMERGENCIA
 * Esta función ignora lo que diga Puppeteer y busca el archivo físicamente.
 */
function encontrarChrome() {
    const rutasPosibles = [
        '/opt/render/project/src/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome',
        '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome'
    ];

    for (const ruta of rutasPosibles) {
        if (fs.existsSync(ruta)) {
            console.log(`✅ Chrome encontrado en ruta conocida: ${ruta}`);
            return ruta;
        }
    }

    try {
        console.log("⚠️ Ruta estándar no hallada, rastreando disco con 'find'...");
        const hallazgo = execSync("find /opt/render -type f -name chrome | grep 'chrome-linux64/chrome' | head -n 1").toString().trim();
        if (hallazgo) {
            console.log(`🎯 Chrome localizado mediante rastreo: ${hallazgo}`);
            return hallazgo;
        }
    } catch (e) {
        console.log("❌ El comando 'find' falló.");
    }

    return null;
}

async function resolverCaptcha(page) {
    try {
        console.log("🧩 Obteniendo SiteKey...");
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
        throw new Error("Error en Captcha: " + e.message);
    }
}

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO CONSULTA: ${cedula} ---`);

        const rutaEjecutable = encontrarChrome();
        if (!rutaEjecutable) {
            throw new Error("No se pudo localizar el ejecutable de Chrome en ninguna ruta.");
        }

        browser = await puppeteer.launch({
            executablePath: rutaEjecutable,
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

        await page.waitForSelector('#continuarBtn', { visible: true });
        await page.click('#continuarBtn');
        
        await page.waitForSelector('#form\\:cedulaInput', { visible: true });
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');

        const token = await resolverCaptcha(page);
        await page.evaluate((t) => {
            const el = document.getElementById('g-recaptcha-response');
            if (el) el.innerHTML = t;
        }, token);

        await page.click('#form\\:consultarBtn');
        console.log("🛰️ Procesando respuesta...");
        
        await page.waitForSelector('#form\\:panelResultado', { timeout: 45000 });
        const
