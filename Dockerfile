FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

RUN mkdir -p /data/auth

ENV NODE_ENV=production
ENV AUTH_DIR=/data/auth
ENV DATA_DIR=/data
ENV TZ=Europe/Istanbul

CMD ["node", "src/index.js"]
