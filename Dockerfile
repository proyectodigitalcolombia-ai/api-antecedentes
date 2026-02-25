FROM node:20

# Instalar dependencias de Linux necesarias para Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libasound2 \
    libnss3 \
    lsb-release \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install

# Comando clave: Instalar el navegador dentro de la imagen
RUN npx puppeteer install

COPY . .
CMD ["node", "worker.js"]
