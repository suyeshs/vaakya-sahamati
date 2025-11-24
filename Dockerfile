# Stage 1: Build Vite client with Bun
FROM oven/bun:1.1.38-alpine AS client-builder

WORKDIR /client

# Copy client package files
COPY client/package*.json ./

# Install client dependencies with Bun
RUN bun install

# Copy client source
COPY client .

# Build Vite app for production using Bun
RUN bun run build

# Stage 2: Bun backend with built client
FROM oven/bun:1.1.38-alpine

# Set working directory
WORKDIR /app

# Copy backend package files
COPY package.json bun.lockb* ./

# Install backend dependencies with Bun
RUN bun install --production

# Copy backend application code (excluding client source)
COPY src ./src
COPY server.js healthcheck.js ./

# Copy built Vite client from stage 1
COPY --from=client-builder /client/dist ./public

# Expose port
EXPOSE 8080

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run healthcheck.js || exit 1

# Run with Bun
CMD ["bun", "run", "server.js"]


