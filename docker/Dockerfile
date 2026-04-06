# FasonRat - Android Remote Management Server
# Run: docker run -d -p 22533:22533 -v fasonrat-data:/app/server/data fasonrat

# Dependencies
FROM node:22-slim AS deps

# Working dir
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Final Image
FROM node:22-slim

# Build arguments
ARG VERSION=dev
ARG BUILD_DATE

# Image metadata (OCI)
LABEL maintainer="Fahim Ahamed" \
      org.opencontainers.image.title="FasonRat" \
      org.opencontainers.image.description="Android Remote Management Server" \
      org.opencontainers.image.source="https://github.com/fahimahamed1/FasonRat.git" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}"

# Environment
ENV NODE_ENV=production \
    APP_HOME=/app \
    NPM_CONFIG_LOGLEVEL=error

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
        openjdk-17-jre-headless \
        wget \
        tini \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --gid 1001 app \
    && useradd --system --uid 1001 --gid 1001 --create-home app

WORKDIR $APP_HOME

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY server ./server
COPY package*.json ./

# Create required directories and set ownership
RUN mkdir -p /app/server/data \
             /app/server/app/factory/decompiled \
             /app/server/data/built_apks \
    && chown -R app:app /app

# Run as non-root with tini init
USER app
ENTRYPOINT ["/usr/bin/tini", "--"]

# Runtime
EXPOSE 22533

# Persistent data volume
VOLUME ["/app/server/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --spider -q http://localhost:22533/ || exit 1

# Start server
CMD ["node", "server/fason.js"]
