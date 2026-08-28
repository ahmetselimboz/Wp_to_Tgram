FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY src ./src

RUN mkdir -p /data/auth

ENV AUTH_DIR=/data/auth
ENV DATA_DIR=/data
ENV NODE_ENV=production

CMD ["node", "src/index.js"]
