// Load environment variables
require("dotenv").config();

// Import dependencies
const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const Database = require("better-sqlite3");

// Set configuration settings
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET;
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "app.db");
const BINARY_PATH = process.env.BINARY_PATH || path.join((process.cwd(), "pattern-finder"));
// Defaulting to 1 instance while miner spawns thread count == logical CPUs. In later iterations limit miner threads and allow multiple miner instances
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT) || 1;
const MAX_QUEUE = parseInt(process.env.MAX_QUEUE);
const RETRY_AFTER_SECONDS = parseInt(process.env.RETRY_AFTER_SECONDS);

// Hardcoded users
const users = [
  {
    id: "admin",
    username: "admin",
    password: "password",
    role: "admin",
  },
  {
    id: "standard",
    username: "standard",
    password: "password",
    role: "standard",
  },
];

