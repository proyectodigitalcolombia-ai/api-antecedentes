# Usamos la imagen oficial de Puppeteer que ya incluye Chrome y las dependencias de Linux
FROM ghcr.io/puppeteer/puppeteer:21.6.0

# Definimos el directorio de trabajo
WORKDIR /app

# --- 🚀 TRUCO DE VELOCIDAD ---
# Evitamos que npm descargue otro Chrome, ya que usaremos el de la imagen base
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copiamos archivos de dependencias
COPY package*.json ./

# Instalamos las librerías (esto ahora será muy rápido)
RUN npm install

# Copiamos el resto del código del bot
COPY . .

# Puerto que usa Render
EXPOSE 10000

# Comando para arrancar el bot
CMD ["node", "src/worker.js"]
