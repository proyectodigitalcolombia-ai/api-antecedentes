FROM node:18
# Instalar dependencias necesarias para Chrome
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    # ... (y muchas más librerías)
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
# Instalar Chrome
RUN npx puppeteer browsers install chrome
COPY . .
CMD ["node", "worker.js"]
