# FasonRat
# Changed from node:20-alpine to node:20-slim for glibc compatibility
FROM node:20-slim

# Build arguments
ARG VERSION=dev

# Image metadata
LABEL maintainer="Fahim Ahamed" \
      org.opencontainers.image.title="FasonRat" \
      org.opencontainers.image.description="Android Remote Management Server" \
      org.opencontainers.image.source="https://github.com/fahimahamed1/FasonRat.git" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version=$VERSION

# Environment
ENV NODE_ENV=production \
    APP_HOME=/app \
    NPM_CONFIG_LOGLEVEL=error

# System setup - using apt-get instead of apk for Debian-based image
RUN apt-get update && apt-get install -y --no-install-recommends \
        openjdk-17-jre-headless \
        wget \
        bash \
        tini \
    && addgroup --system app --gid 1001 \
    && adduser --system app --uid 1001 --gid 1001 \
    && mkdir -p $APP_HOME \
    && chown -R app:app $APP_HOME \
    && rm -rf /var/lib/apt/lists/*

# App setup
WORKDIR $APP_HOME

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Copy application
COPY server ./server

# Create data directory and set permissions
RUN mkdir -p /app/server/data \
    && chown -R app:app /app

# Run as non-root with tini
USER app
ENTRYPOINT ["/usr/bin/tini", "--"]

# Runtime
EXPOSE 22533

# Volume for persistent data
VOLUME ["/app/server/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost:22533/ || exit 1

# Start
CMD ["node", "server/fason.js"]
