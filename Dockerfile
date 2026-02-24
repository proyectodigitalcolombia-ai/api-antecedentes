# Usamos una imagen que ya tiene Puppeteer y Chrome instalados
FROM ghcr.io/puppeteer/puppeteer:21.11.0

# Cambiamos a usuario root para tener permisos
USER root

# Directorio de trabajo
WORKDIR /app

# Copiamos solo los archivos de dependencias primero
COPY package*.json ./

# Instalamos dependencias (sin descargar Chrome otra vez)
RUN npm install

# Copiamos el resto del código
COPY . .

# Comando para arrancar el bot
CMD ["node", "worker.js"]
