FROM rust:slim AS builder
WORKDIR /usr/src/pattern-finder
COPY rust/Cargo.toml rust/Cargo.lock ./
COPY rust/src ./src
RUN cargo build --release
