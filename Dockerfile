FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root
WORKDIR /app

# Copiamos package.json pero NO el lock si está dando problemas
COPY package.json ./

# Instalación limpia
RUN npm install --prefer-offline --no-audit

COPY . .

# IMPORTANTE: Verifica que este archivo exista en tu repo
CMD ["node", "worker.js"]
