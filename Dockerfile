# Usamos Node 20 como base (conforme a tu variable NODE_VERSION)
FROM node:20

# 1. Instalar librerías del sistema necesarias para que Google Chrome funcione en Linux
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

# 2. Crear carpeta de trabajo
WORKDIR /app

# 3. Copiar dependencias e instalarlas
COPY package*.json ./
RUN npm install

# 4. INSTALAR EL NAVEGADOR (Este es el comando que preguntabas)
RUN npx puppeteer install

# 5. Copiar todo el código (index.js, worker.js, etc.)
COPY . .

# 6. Exponer el puerto
EXPOSE 10000

# 7. Comando de inicio
# NOTA: Si este servicio es el WORKER, usa "worker.js". Si es la API, usa "index.js"
CMD ["node", "worker.js"]
