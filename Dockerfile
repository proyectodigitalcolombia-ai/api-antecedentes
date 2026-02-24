FROM ghcr.io/puppeteer/puppeteer:21.11.0

# Saltamos descarga de Chrome y apuntamos al ejecutable local
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

USER root
WORKDIR /app

# Copiar archivos de dependencias
COPY package.json ./

# Instalar librerías
RUN npm install --no-package-lock

# Copiar el resto del código
COPY . .

# Comando de ejecución
CMD ["npm", "run", "worker"]
