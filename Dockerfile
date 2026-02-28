# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.2.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build-time dummy values (overridden at runtime)
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:./placeholder.db"
ENV BETTER_AUTH_SECRET="placeholder-secret-must-be-at-least-32-characters-long"
ENV BETTER_AUTH_URL="http://placeholder:3000"

# Build the application
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

# Install pnpm for production
RUN corepack enable && corepack prepare pnpm@10.2.0 --activate

WORKDIR /app


# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Install production dependencies AND drizzle-kit for migrations
RUN pnpm install --prod --frozen-lockfile && \
    pnpm add -D drizzle-kit

# Copy built application
COPY --from=builder /app/.next ./.next

# Copy Drizzle schema and config files for migrations
COPY --from=builder /app/src/server/db/schema.ts ./src/server/db/schema.ts
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/env.js ./src/env.js
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Copy and set permissions for entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Use entrypoint script to initialize database and start app
ENTRYPOINT ["/app/entrypoint.sh"]