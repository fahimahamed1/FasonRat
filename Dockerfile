# FasonRat
FROM node:20-alpine

# Build arguments
ARG VERSION=dev

# Image metadata
LABEL maintainer="Fahim Ahamed" \
      org.opencontainers.image.title="FasonRat" \
      org.opencontainers.image.description="Android Remote Management Server" \
      org.opencontainers.image.source="https://github.com/fahimahamed1/FasonRat" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version=$VERSION

# Environment
ENV NODE_ENV=production \
    APP_HOME=/app \
    NPM_CONFIG_LOGLEVEL=error

# System setup
RUN apk add --no-cache openjdk17-jre-headless wget bash tini \
    && addgroup -S app -g 1001 \
    && adduser -S app -u 1001 -G app \
    && mkdir -p $APP_HOME \
    && chown -R app:app $APP_HOME \
    && rm -rf /var/cache/apk/*

# App setup
WORKDIR $APP_HOME

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Copy application
COPY server ./server

# Create data directory and set permissions before switching user
RUN mkdir -p /app/server/data \
    && chown -R app:app /app

# Run as non-root with tini
USER app
ENTRYPOINT ["/sbin/tini", "--"]

# Runtime
EXPOSE 22533

# Volume for persistent data - use absolute path (env vars don't expand in VOLUME)
VOLUME ["/app/server/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost:22533/ || exit 1

# Start
CMD ["node", "server/fason.js"]
