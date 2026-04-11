const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain' }));

// In‑memory storage
const games = new Map();
let currentLuaScript = "print('hello world')";
let linkedUsername = '';               // The username to verify against

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
  const { script } = req.body;
  if (typeof script !== 'string') {
    return res.status(400).json({ error: 'Missing script' });
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
// Username linking (for verification)
// ========================
app.post('/api/set-username', (req, res) => {
  const { username } = req.body;
  if (typeof username !== 'string') {
    return res.status(400).json({ error: 'Missing username' });
  }
  linkedUsername = username.trim();
  console.log(`🔗 Linked username set to: ${linkedUsername}`);
  res.json({ success: true, username: linkedUsername });
});

app.get('/api/get-username', (req, res) => {
  res.json({ username: linkedUsername });
});

// Cleanup old games
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  for (const [placeId, game] of games) {
    if (now - game.reportedAt > oneHour) games.delete(placeId);
  }
}, 60 * 1000);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
