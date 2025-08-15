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

// SQLite setup
const db = new Database(DB_PATH);
db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        pattern TEXT NOT NULL,
        protocol TEXT NOT NULL,
        inputLength INTEGER NOT NULL,
        status TEXT NOT NULL,
        submittedAt INTEGER NOT NULL,
        startedAt INTEGER,
        finishedAt INTEGER,
        input TEXT,
        digest TEXT
    );`);

// Prepared statements for updating SQLite entries
const insertJob = db.prepare(`
    INSERT INTO jobs (id, owner, pattern, protocol, inputLength, status, submittedAt)
    VALUES (@id, @owner, @pattern, @protocol, @inputLength, @status, @submittedAt)
`);

const updateToRunning = db.prepare(`
    UPDATE jobs
    SET status='running', startedAt=@startedAt
    WHERE id=@id
`);

const updateToFinished = db.prepare(`
    UPDATE jobs
    SET status=@status, finishedAt=@finishedAt, input=@input, digest=@digest
    WHERE id=@id
`);

const updateToCancelled = db.prepare(`
    UPDATE jobs
    SET status='cancelled', finishedAt=@finishedAt
    WHERE id=@id
`);

const getJob = db.prepare(`SELECT * FROM jobs WHERE id=?`);

// Express app
const app = express();
app.use(express.json({ limit: "1mb" }));

// Auth: Login route
app.post("/v1/auth/login", async (req, res) => {
  const { username, password } = req.body;

  const user = USERS.find(
    (u) => u.username === username && u.password === password,
  );
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  // Generate JWT
  // Send JWT in response
});

