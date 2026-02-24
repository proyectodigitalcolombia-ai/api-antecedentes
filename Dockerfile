FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root
WORKDIR /app

# Forzamos que no descargue nada extra, usaremos lo que ya trae la imagen
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

COPY package*.json ./

# Instalamos de forma limpia y completa
RUN npm install

# Instalamos explícitamente las piezas que faltan
RUN npm install puppeteer-core puppeteer-extra puppeteer-extra-plugin-stealth redis express

COPY . .

RUN chown -R pptruser:pptruser /app
USER pptruser

CMD ["node", "worker.js"]
