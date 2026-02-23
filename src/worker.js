const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

// --- CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
const API_KEY_2CAPTCHA = 'fd9177f1a724968f386c07483252b4e8';
const client = createClient({ url: REDIS_URL });

/**
 * Función para resolver el captcha
 */
async function resolverCaptcha(page) {
    try {
        console.log("🧩 Detectando SiteKey...");
        const siteKey = await page.evaluate(() => {
            const el = document.querySelector('.g-recaptcha');
            return el ? el.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) throw new Error("No se encontró SiteKey");

        const resp = await axios.get(`http://2captcha.com/in.php?key=${API_KEY_2CAPTCHA}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${page.url()}&json=1`);
        const requestId = resp.data.request;

        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const check = await axios.get(`http://2captcha.com/res.php?key=${API_KEY_2CAPTCHA}&action=get&id=${requestId}&json=1`);
            if (check.data.status === 1) return check.data.request;
            if (check.data.request !== 'CAPCHA_NOT_READY') throw new Error(check.data.request);
            console.log("... esperando resolución ...");
        }
    } catch (e) { throw new Error("Captcha: " + e.message); }
}

/**
 * Lógica de Scraping con Blindaje de Ruta
 */
async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 CONSULTA: ${cedula} ---`);
        
        // 🛡️ ESTRATEGIA DE RUTAS: Buscamos Chrome donde Render suele guardarlo
        const posiblesRutas = [
            '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome',
            '/opt/render/project/src/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome',
            process.env.PUPPETEER_EXECUTABLE_PATH
        ];

        // Filtramos la primera ruta que realmente exista en el disco
        const rutaFinal = posiblesRutas.find(ruta => ruta && fs.existsSync(ruta));

        if (rutaFinal) {
            console.log(`🚀 Iniciando Chrome desde ruta validada: ${rutaFinal}`);
        } else {
            console.log("⚠️ No se encontró la ruta física. Intentando inicio estándar...");
        }

        browser = await puppeteer.launch({
            executablePath: rutaFinal || undefined, // Usa la ruta encontrada o deja que Puppeteer intente la suya
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        console.log("🔗 Navegando a la web de la Policía...");
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { waitUntil: 'networkidle2' });
        
        await page.waitForSelector('#continuarBtn');
        await page.click('#continuarBtn');
        
        await page.waitForSelector('#form\\:cedulaInput');
        await page.type('#form\\:cedulaInput', cedula.toString());
        await page.select('#form\\:tipoDocumento', '1');

        const token =
