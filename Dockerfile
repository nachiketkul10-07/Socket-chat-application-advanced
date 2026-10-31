# Multi-stage production Dockerfile
FROM node:20-bullseye-slim AS builder

WORKDIR /app

# Copy dashboard and install dependencies to build frontend bundle
COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm ci

COPY dashboard/ ./dashboard/
RUN cd dashboard && npm run build

# Runtime Stage
FROM node:20-bullseye-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV TCP_PORT=8080

# Install production dependencies for backend and bridge
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY bridge/package*.json ./bridge/
RUN cd bridge && npm ci --omit=dev

# Copy application source files
COPY backend/ ./backend/
COPY bridge/ ./bridge/
COPY --from=builder /app/dashboard/dist ./dashboard/dist
COPY run_production.js ./
COPY package.json ./

EXPOSE 3001 8080

CMD ["node", "run_production.js"]

