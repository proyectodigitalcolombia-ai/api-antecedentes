FROM node:20-slim

WORKDIR /app

# Instalamos solo lo necesario para la API
COPY package*.json ./
RUN npm install --only=production

# Copiamos el archivo index.js
COPY index.js .

# Exponemos el puerto de Render
EXPOSE 10000

# Comando para iniciar la API
CMD ["node", "index.js"]
