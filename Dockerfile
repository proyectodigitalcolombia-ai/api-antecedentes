FROM ghcr.io/puppeteer/puppeteer:21.11.0

# Evitamos que Puppeteer intente descargar Chrome de nuevo
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

USER root
WORKDIR /app

# Copiamos el package.json
COPY package.json ./

# Instalamos solo lo necesario (la API ya es ligera, aquí instalamos todo)
RUN npm install --no-package-lock

# Copiamos el resto del código
COPY . .

# Comando para arrancar el bot
CMD ["npm", "run", "worker"]
