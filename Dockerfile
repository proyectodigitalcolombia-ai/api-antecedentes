FROM ghcr.io/puppeteer/puppeteer:21.6.0

# Saltamos la descarga de Chrome y cualquier script de instalación
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /app

COPY package*.json ./

# El truco está aquí: --ignore-scripts
RUN npm install --ignore-scripts

COPY . .

EXPOSE 10000

CMD ["node", "src/worker.js"]
