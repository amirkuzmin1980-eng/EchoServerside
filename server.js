const express = require('express');
const app = express();
app.use(express.text());

app.post('/api/execute', (req, res) => {
    const script = req.body;
    console.log('Script received:', script);
    res.send('OK');
});

app.get('/', (req, res) => {
    res.send('HAX API Running');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
