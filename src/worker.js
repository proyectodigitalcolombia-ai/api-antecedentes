const puppeteer = require('puppeteer');
const { createClient } = require('redis');
const { Solver } = require('2captcha');
const express = require('express');
const fs = require('fs');

// --- CONFIGURACIÓN ---
const REDIS_URL = process.env.REDIS_URL;
const CAPTCHA_KEY = process.env.CAPTCHA_KEY || "TU_API_KEY_AQUÍ";

const solver = new Solver(CAPTCHA_KEY);
const client = createClient({ url: REDIS_URL });

client.on('error', (err) => console.log('🔴 Redis Client Error', err));

async function ejecutarScraping(cedula) {
    let browser;
    try {
        console.log(`--- 🤖 INICIANDO NUEVA CONSULTA: ${cedula} ---`);
        
        // 1. RUTAS POSIBLES (Donde Render suele instalar Chrome)
        const rutas = [
            '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome',
            '/opt/render/project/src/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome'
        ];

        let chromePath = '';
        for (const ruta of rutas) {
            if (fs.existsSync(ruta)) {
                chromePath = ruta;
                console.log(`✅ Chrome localizado en: ${ruta}`);
                break;
            }
        }

        // Si no se encuentra, hacemos un debug de la carpeta
        if (!chromePath) {
            console.log("❌ Chrome no encontrado en rutas estándar. Escaneando directorio...");
            const baseDir = '/opt/render/.cache/puppeteer';
            if (fs.existsSync(baseDir)) {
                console.log("Contenido detectado en cache:", fs.readdirSync(baseDir));
            }
            throw new Error("No se pudo hallar el ejecutable de Chrome. Revisa el build log.");
        }

        // 2. LANZAR NAVEGADOR
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: chromePath,
            ignoreDefaultArgs: ['--disable-extensions'], 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--no-zygote'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log('🌐 1. Entrando a la web de la Policía...');
        await page.goto('https://srv2.policia.gov.co/antecedentes/publico/inicio.xhtml', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // 3. PASAR PÁGINA DE TÉRMINOS
        await page.waitForSelector('input[type="checkbox"]', { timeout: 15000 });
        await page.click('input[type="checkbox"]');
        await page.click('#continuarPasoSiguiente');

        // 4. CAPTCHA
        console.log('🧩 2. Resolviendo Captcha...');
        const siteKey = await page.evaluate(() => {
            return document.querySelector('.g-recaptcha')?.getAttribute('data-sitekey') || '6LdX80EUAAAAAL6v5yM8S7L9S7S7S7
