FROM node:22-alpine

WORKDIR /app

# Copy dependency definition
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy app code
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

# Persistent data directory for SQLite
RUN mkdir -p /app/data && chown -R node:node /app

USER node

ENV PORT=3000
ENV NODE_ENV=production
ENV DB_PATH=/app/data/till.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/config || exit 1

CMD ["node", "server.js"]
