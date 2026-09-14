# ==========================================
# Stage 1: Build Application
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source and config files
COPY tsconfig*.json nest-cli.json ./
COPY src/ ./src/

# Compile TypeScript
RUN npm run build

# ==========================================
# Stage 2: Production Runner
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install curl for healthcheck & dumb-init for graceful signal handling
RUN apk add --no-cache curl dumb-init

# Copy dependencies manifest and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Use non-root node user for security
USER node

EXPOSE 3000

# Dumb-init ensures graceful signal propagation (SIGTERM/SIGINT) for BullMQ worker shutdown
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

