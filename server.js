const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const games = new Map();

app.post('/api/report', (req, res) => {
  const game = req.body;
  if (!game.placeId) return res.status(400).json({ error: 'Missing placeId' });
  game.reportedAt = Date.now();
  games.set(game.placeId, game);
  res.json({ success: true });
});

app.get('/api/games', (req, res) => {
  const now = Date.now();
  const activeGames = Array.from(games.values())
    .filter(g => now - g.reportedAt < 3600000) // last hour
    .sort((a, b) => b.reportedAt - a.reportedAt);
  res.json(activeGames);
});

app.listen(3000);
