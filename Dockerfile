FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root
WORKDIR /app

# Evita que Puppeteer intente descargar Chrome (porque ya está en la imagen)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./

# Instalamos ignorando los scripts que bloquean el build
RUN npm install --ignore-scripts

# Instalamos manualmente los plugins necesarios
RUN npm install puppeteer-extra puppeteer-extra-plugin-stealth express redis

COPY . .

# Permisos para el usuario de Puppeteer
RUN chown -R pptruser:pptruser /app
USER pptruser

# Render sobrescribirá esto con el Start Command
CMD ["node", "index.js"]
