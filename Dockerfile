# Usamos una imagen de Node.js que ya viene con herramientas básicas
FROM ghcr.io/puppeteer/puppeteer:20.0.0

# Cambiamos al usuario root para tener permisos de instalación
USER root

# Creamos la carpeta de la app
WORKDIR /app

# Copiamos los archivos de configuración primero
COPY package*.json ./

# Instalamos las librerías (dependencias)
RUN npm install

# Copiamos todo el código del proyecto
COPY . .

# Exponemos el puerto que usa Render
EXPOSE 10000

# Comando por defecto (la API se iniciará desde render.yaml, 
# pero dejamos este como respaldo)
CMD ["node", "src/server.js"]
