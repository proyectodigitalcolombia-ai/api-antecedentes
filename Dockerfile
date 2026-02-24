# 1. Usamos una imagen que ya trae Chrome instalado para ahorrar tiempo y RAM
FROM ghcr.io/puppeteer/puppeteer:21.11.0

# 2. Permisos de administrador para instalar carpetas
USER root

# 3. Carpeta de trabajo
WORKDIR /app

# 4. Copiamos los archivos de configuración primero
COPY package*.json ./

# 5. Instalación ultra ligera (Evita que Render se congele)
RUN npm install --no-package-lock --no-audit --no-fund

# 6. Copiamos todo el código del bot
COPY . .

# 7. Comando para iniciar el Bot (Asegúrate de que tu archivo se llame worker.js)
CMD ["node", "worker.js"]
