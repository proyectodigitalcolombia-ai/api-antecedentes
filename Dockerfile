FROM node:20-slim

# Directorio de trabajo
WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install --only=production

# Copiar el código
COPY index.js .

# Exponer el puerto de Render
EXPOSE 10000

# Comando de arranque
CMD ["node", "index.js"]
