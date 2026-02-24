FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root
WORKDIR /app

# --- ESTA LÍNEA ES EL TRUCO ---
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./
RUN npm install --loglevel=info

COPY . .
RUN chown -R pptruser:pptruser /app
USER pptruser

CMD ["node", "index.js"]
