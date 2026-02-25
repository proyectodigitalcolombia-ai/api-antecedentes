FROM node:20

WORKDIR /app

# Instalamos dependencias
COPY package*.json ./
RUN npm install

# Copiamos el código
COPY . .

# Puerto de Render
EXPOSE 10000

# Comando de arranque
CMD ["node", "index.js"]
