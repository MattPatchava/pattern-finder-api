FROM rust:slim AS builder
WORKDIR /usr/src/pattern-finder
COPY rust/Cargo.toml rust/Cargo.lock ./
COPY rust/src ./src
RUN cargo build --release

FROM node:20
WORKDIR /app
COPY node/package*.json ./
RUN npm install --production
COPY node/ ./
COPY --from=builder /usr/src/pattern-finder/target/release/pattern-finder /app/pattern-finder
CMD ["node", "server.js"]
