FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared package
COPY shared/package*.json ./shared/
COPY shared/tsconfig.json ./shared/
COPY shared/src ./shared/src

# Build shared package
WORKDIR /app/shared
RUN npm install
RUN npm run build

# Copy service
WORKDIR /app/services/user-service
COPY services/user-service/package*.json ./
COPY services/user-service/tsconfig.json ./
COPY services/user-service/src ./src

# Update shared package reference to use local path
RUN npm pkg set dependencies.@streamia/shared="file:../../shared"

# Install dependencies
RUN npm install

# Build service
RUN npm run build

# Prune dev dependencies for production
RUN npm prune --omit=dev

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy built shared package
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package*.json ./shared/

# Copy built service and pruned node_modules
COPY --from=builder /app/services/user-service/dist ./dist
COPY --from=builder /app/services/user-service/package*.json ./
COPY --from=builder /app/services/user-service/node_modules ./node_modules

# Fix the @streamia/shared - copy the actual files instead of symlink
RUN rm -rf node_modules/@streamia/shared && \
    mkdir -p node_modules/@streamia/shared && \
    cp -r /app/shared/* node_modules/@streamia/shared/

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Run
CMD ["node", "dist/index.js"]
