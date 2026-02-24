FROM ghcr.io/puppeteer/puppeteer:21.6.0

WORKDIR /app

# Saltamos descarga de Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./

# --- CAMBIO AQUÍ: Instalación limpia y rápida ---
RUN npm install --no-audit --no-fund --loglevel=info

COPY . .

EXPOSE 10000

CMD ["node", "src/worker.js"]
