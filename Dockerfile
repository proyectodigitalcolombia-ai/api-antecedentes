FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root
WORKDIR /app

# Esto obliga a NPM a ignorar el script de descarga de Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./

# Instalamos ignorando scripts de post-instalación
RUN npm install --ignore-scripts --loglevel=info

COPY . .

# Instalamos solo las dependencias de los plugins manualmente para asegurar que existan
RUN npm install puppeteer-extra puppeteer-extra-plugin-stealth

RUN chown -R pptruser:pptruser /app
USER pptruser

CMD ["node", "index.js"]
