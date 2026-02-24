FROM ghcr.io/puppeteer/puppeteer:21.6.0

WORKDIR /app

# Copia tus archivos de dependencias
COPY package*.json ./

# Instala lo necesario
RUN npm install

# Copia todo tu código a la imagen
COPY . .

# El puerto que usa Render
EXPOSE 10000

# Lanza tu worker
CMD ["node", "src/worker.js"]
