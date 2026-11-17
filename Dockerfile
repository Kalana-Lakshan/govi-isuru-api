# Govi Isuru API: small production image (Node 22, non-root, no dev dependencies).
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts

RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/uploads && chown -R app:app /app/uploads
USER app

ENV PORT=5000 UPLOADS_DIR=/app/uploads
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health >/dev/null || exit 1
CMD ["node", "src/index.js"]
