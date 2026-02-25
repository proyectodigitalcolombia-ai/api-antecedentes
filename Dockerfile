# Usamos Node 20 (Variable NODE_VERSION=20)
FROM node:20

# Instalamos dependencias del sistema para Google Chrome
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
    fonts-liberation \
    libgbm1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos archivos de dependencias
COPY package*.json ./
RUN npm install

# Instalamos el navegador para Puppeteer
RUN npx puppeteer install

# Copiamos todo el código
COPY . .

# Exponemos el puerto de Render
EXPOSE 10000

# Comando por defecto (será ignorado por la configuración de Render que haremos abajo)
CMD ["node", "index.js"]
