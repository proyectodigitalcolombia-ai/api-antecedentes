FROM ghcr.io/puppeteer/puppeteer:21.11.0

USER root
WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_VERSION=20

COPY package*.json ./
RUN npm install

COPY . .
RUN chown -R pptruser:pptruser /app
USER pptruser

CMD ["node", "worker.js"]
