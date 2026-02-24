FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root
WORKDIR /app

# Copiamos el manual de instrucciones
COPY package.json ./

# Instalamos las librerías
RUN npm install --no-package-lock

# Copiamos el código
COPY . .

# Ejecutamos el bot
CMD ["npm", "run", "worker"]
