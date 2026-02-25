const express = require('express');
const redis = require('redis');
const app = express();

const client = redis.createClient({ url: process.env.REDIS_URL });

app.get('/', (req, res) => res.send("API FUNCIONANDO ✅"));
app.get('/health', (req, res) => res.send("OK"));

app.all('/consultar', async (req, res) => {
    const cedula = req.query.cedula || req.body.cedula;
    if (!cedula) return res.status(400).json({ error: "Falta cedula" });
    
    try {
        if (!client.isOpen) await client.connect();
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        res.json({ status: "Encolado", cedula });
    } catch (e) {
        res.status(500).json({ error: "Error Redis" });
    }
});

app.listen(process.env.PORT || 10000, '0.0.0.0');
