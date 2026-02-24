FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root
WORKDIR /app

COPY package.json ./
# Forzamos la instalación de puppeteer solo aquí dentro
RUN npm install --no-package-lock && npm install puppeteer@21.11.0

COPY . .

CMD ["npm", "run", "worker"]
