FROM ghcr.io/puppeteer/puppeteer:21.11.0

# Cambiamos al usuario root para tener permisos de instalación
USER root

WORKDIR /app

# Copiamos solo lo necesario para instalar primero
COPY package*.json ./

# Instalamos dependencias saltando scripts pesados
RUN npm install --loglevel=info

# Copiamos el resto del código
COPY . .

# Ajustamos permisos para el usuario de puppeteer
RUN chown -R pptruser:pptruser /app

# Volvemos al usuario seguro
USER pptruser

# El comando se define en Render (Start Command)
CMD ["node", "index.js"]
