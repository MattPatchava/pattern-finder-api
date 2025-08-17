# Build the miner
FROM rust:slim AS builder
WORKDIR /usr/src/pattern-finder
COPY rust/Cargo.toml rust/Cargo.lock ./
COPY rust/src ./src
RUN cargo build --release

# Runtime image for Node API
FROM node:20-slim
WORKDIR /app
COPY node/package*.json ./
RUN npm ci --omit=dev
COPY node/ ./

# Copy binary from builder image
COPY --from=builder /usr/src/pattern-finder/target/release/pattern-finder /app/pattern-finder

# Set node as the default user and give them privileges to the /app directory recursively
RUN chown -R node:node /app
USER node

EXPOSE 8080

CMD ["node", "server.js"]
