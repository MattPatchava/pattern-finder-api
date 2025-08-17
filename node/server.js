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
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(path.join(DATA_DIR, "jobs"), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "logs"), { recursive: true });
const DB_PATH = path.join(DATA_DIR, "jobs", "app.db");
const BINARY_PATH =
    process.env.BINARY_PATH || path.join(process.cwd(), "pattern-finder");
// Defaulting to 1 instance while miner spawns thread count == logical CPUs. In later iterations limit miner threads and allow multiple miner instances
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT) || 1;
const MAX_QUEUE = parseInt(process.env.MAX_QUEUE) || 10;
const RETRY_AFTER_SECONDS = parseInt(process.env.RETRY_AFTER_SECONDS) || 10;

// Hardcoded users
const userIds = {
    "admin": {
        id: "admin",
        username: "admin",
        password: "password",
        role: "admin",
    },
    "standard": {
        id: "standard",
        username: "standard",
        password: "password",
        role: "standard",
    },
};

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
        success INTEGER,
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
    SET status='finished', finishedAt=@finishedAt, success=@success, input=@input, digest=@digest
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

    const user = userIds[username];
    if (!user || user.password !== password) return res.status(401).json({ error: "Invalid credentials" });

    let token = jwt.sign(
        { id: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: "15m" }
    );

    res.json({ token });
});

// JWT verification middleware
function authenticateJwt(req, res, next) {
    const header = req.headers["authorization"];

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Missing or invalid Authorization header"
        });
    }

    const token = header.split(" ")[1];

    jwt.verify(token, JWT_SECRET, (error, user) => {
        if (error) return res.status(403).json({error: "Expired or invalid token"});

        req.user = user;
        next();
    });
}


// Receive job
app.post("/v1/jobs", authenticateJwt, async (req, res) => {
    if (queue.length >= MAX_QUEUE) {
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

// Search for job
app.get("/v1/jobs/:id", authenticateJwt, (req, res) => {
    const job = getJob.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Not found" });
    if (!requireAdminOrOwner(job, req.user)) return res.status(403).json({ error: "Forbidden" });

    res.status(200).json({
        id: job.id,
        owner: job.owner,
        pattern: job.pattern,
        protocol: job.protocol,
        inputLength: job.inputLength,
        status: job.status,
        submittedAt: job.submittedAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        durationMs: job.finishedAt - job.startedAt,
        success: job.success,
        input: job.input,
        digest: job.digest,
    });
});

function requireAdminOrOwner(job, user) {
    return user.id === job.owner || user.role === "admin";
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
                finishedAt: Date.now(),
                success: result.success ? 1 : 0,
                input: result.match_data.input,
                digest: result.match_data.digest,
            });
        } catch (e) {
            console.error(
                "Failed to parse binary output:",
                e,
                "Raw output:",
                chunk,
            );
        }
    });
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
