# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Run stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy built assets
COPY --from=builder /app/dist ./dist

# The app uses --env-file=.env by default in the start script, 
# but Docker usually prefers environment variables.
# We'll expose the port.
EXPOSE 5000

# Start the application
CMD ["node", "dist/index.cjs"]
