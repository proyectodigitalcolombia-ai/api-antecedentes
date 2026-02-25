# Usamos Node 20
FROM node:20

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código (incluyendo index.js)
COPY . .

# Exponer el puerto que usa Render (10000 por defecto)
EXPOSE 10000

# Comando para arrancar la API
CMD ["node", "index.js"]
