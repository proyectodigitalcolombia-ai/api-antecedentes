FROM ghcr.io/puppeteer/puppeteer:21.6.0

# Saltamos la descarga de Chrome para ahorrar tiempo y RAM
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Copiamos solo lo necesario primero
COPY package*.json ./

# Instalamos de forma ultra rápida
RUN npm install --no-audit --no-fund --loglevel=info

# Al final copiamos el código
COPY . .

EXPOSE 10000

CMD ["node", "src/worker.js"]
