const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain' }));

// In‑memory storage
const games = new Map();
let currentLuaScript = "print('hello world')";
let linkedUsername = '';
const users = new Map();
const validKeys = new Map();

// Default admin account (CEO)
(async () => {
  const adminEmail = 'admin@monoxide.local';
  const adminPassword = 'jgoatman100';
  const hash = await bcrypt.hash(adminPassword, 10);
  users.set(adminEmail, {
    email: adminEmail,
    passwordHash: hash,
    username: 'tr0llzkidd',
    role: 'CEO',
    createdAt: Date.now()
  });
  console.log('✅ Admin account ready');
})();

// Admin key generation
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
  setTimeout(() => validKeys.delete(key), 7 * 24 * 60 * 60 * 1000);
  res.json({ key });
});

// Verify key
app.post('/api/verify-key', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Missing key' });
  const keyData = validKeys.get(key);
  if (!keyData) return res.status(401).json({ valid: false, error: 'Invalid or expired key' });
  if (keyData.used) return res.status(401).json({ valid: false, error: 'Key already used' });
  res.json({ valid: true });
});

// Signup (no Turnstile)
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
  res.json({ success: true });
});

// Login (no Turnstile)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const user = users.get(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password' });

  const token = crypto.randomBytes(32).toString('hex');
  user.token = token;
  users.set(email, user);
  res.json({ success: true, token, username: user.username, role: user.role });
});

// Verify session token
app.post('/api/verify-token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({ valid: false });
  const user = Array.from(users.values()).find(u => u.token === token);
  if (!user) return res.status(401).json({ valid: false });
  res.json({ valid: true, username: user.username, role: user.role });
});

// Game reporting
app.post('/api/report', (req, res) => {
  const game = req.body;
  if (!game.id && !game.placeId) return res.status(400).json({ error: 'Missing placeId' });
  const placeId = game.id || game.placeId;
  const playing = game.players || game.playing || 0;
  const storedGame = {
    placeId, name: game.name || '', playing, thumbnail: game.thumbnail || '',
    visits: game.visits || '', creator: game.creator || '', creator_id: game.creator_id || '',
    maxPlayers: game.max_players || '', genre: game.genre || '', created: game.created || '',
    voice: game.voice || '', rig: game.rig || '',
    joinUrl: `https://www.roblox.com/games/${placeId}/-`,
    reportedAt: Date.now()
  };
  games.set(placeId, storedGame);
  res.json({ success: true });
});

app.get('/api/games', (req, res) => {
  const now = Date.now();
  const activeGames = Array.from(games.values())
    .filter(g => g.playing > 0 && (now - g.reportedAt) < 3600000)
    .sort((a, b) => b.playing - a.playing);
  res.json(activeGames);
});

// Script storage
app.post('/api/set-script', (req, res) => {
  const { script } = req.body;
  if (typeof script !== 'string') return res.status(400).json({ error: 'Missing script' });
  currentLuaScript = script;
  res.json({ success: true });
});
app.get('/api/get-script', (req, res) => res.json({ script: currentLuaScript }));
app.get('/api/get-lua', (req, res) => res.type('text/plain').send(currentLuaScript));

// Username linking
app.post('/api/set-username', (req, res) => {
  const { username } = req.body;
  if (typeof username !== 'string') return res.status(400).json({ error: 'Missing username' });
  linkedUsername = username.trim();
  res.json({ success: true });
});
app.get('/api/get-username', (req, res) => res.json({ username: linkedUsername }));

// Cleanup old games
setInterval(() => {
  const now = Date.now();
  for (const [placeId, game] of games) if (now - game.reportedAt > 3600000) games.delete(placeId);
}, 60000);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
