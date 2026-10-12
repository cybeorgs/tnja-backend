# Base image (Node.js 22 LTS)
FROM node:22-alpine AS builder

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (reproducible, from lockfile)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Production image
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=9000

# node_modules keeps the Prisma CLI so migrations can run at container start
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
# Logo used by certificate generation
COPY --from=builder /app/assets ./assets

RUN mkdir -p uploads

EXPOSE 9000

# Apply pending migrations (non-destructive), then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
