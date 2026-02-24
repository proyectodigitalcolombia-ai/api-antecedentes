FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root
WORKDIR /app

# Copiamos solo el package para instalar dependencias primero (mejor para el cache)
COPY package.json ./
RUN npm install --no-package-lock

# Copiamos todo lo demás
COPY . .

# El bot usa el script "worker" definido en el package.json
CMD ["npm", "run", "worker"]
