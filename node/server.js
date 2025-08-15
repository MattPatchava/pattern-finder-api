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
const BINARY_PATH =
    process.env.BINARY_PATH || path.join((process.cwd(), "pattern-finder"));
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

const queue = [];
const active = new Map();
let running = 0;

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

// Receive job
app.post("/v1/jobs", async (req, res) => {
    if (queue.length > MAX_QUEUE) {
        res.set("Retry-After", String(RETRY_AFTER_SECONDS));
        return res.status(429).json({ error: "Server busy. Try again later." });
    }

    const { pattern, protocol, inputLength } = req.body;

    // Validate user input
    if (!ensureValidHex(pattern)) {
        return res.status(400).json({ error: "Invalid hexadecimal pattern" });
    }

    if (!ensureValidProtocol(protocol)) {
        return res.status(400).json({ error: "Invalid protocol" });
    }

    if (!ensureValidInputLengthSha256(inputLength)) {
        return res.status(400).json({ error: "Invalid input length (1-64)" });
    }

    const id = crypto.randomUUID();
    const submittedAt = Date.now();

    insertJob.run({
        id,
        // Hardcoding user ID for now until JWT middleware is implemented
        owner: "admin",
        pattern,
        protocol,
        inputLength,
        status: "queued",
        submittedAt,
    });

    enqueueJob(id);

    return res.status(202).json({ id, status: "queued" });
});

// Input validation
function ensureValidHex(h) {
    return typeof h === "string" && /^[0-9a-fA-F]{1,64}$/.test(h);
}

function ensureValidProtocol(protocol) {
    // Update this after adding support for other hashing protocols
    return protocol === "sha256";
}

function ensureValidInputLengthSha256(i) {
    // sha256 hashes are 64 hex digits
    i = parseInt(i, 10);
    return Number.isInteger(i) && i >= 1 && i <= 64;
}

}

// Queue management
function enqueueJob(id) {
    queue.push(id);
    setImmediate(maybeRunNext);
}

async function maybeRunNext() {
    if (running >= MAX_CONCURRENT) return;
    const nextId = queue.shift();
    if (!nextId) return;
    const job = getJob.get(nextId);
    console.log("Fetched job:", job);
    if (!job || job.status !== "queued") return maybeRunNext();

    const startedAt = Date.now();
    updateToRunning.run({ id: job.id, startedAt });

    running++;

    const argv = [
        "--pattern",
        job.pattern,
        "--protocol",
        job.protocol,
        "--input-length",
        String(job.inputLength),
        "--format",
        "json",
    ];
    const child = spawn(BINARY_PATH, argv);

    active.set(job.id, { child, startedAt });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
        try {
            const result = JSON.parse(chunk);

            updateToFinished.run({
                id: job.id,
                status: "finished",
                finishedAt: Date.now(),
                input: result.input,
                digest: result.digest,
            });
        } catch (e) {
            console.error("Failed to parse binary output:", e, "Raw output:", chunk);
        }
    });
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
