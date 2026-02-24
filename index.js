const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());
const client = redis.createClient({ url: process.env.REDIS_URL });

app.all('/consultar', async (req, res) => {
    const cedula = req.query.cedula || req.body.cedula;

    if (!cedula) return res.status(400).json({ error: "Falta la cédula." });

    try {
        if (!client.isOpen) await client.connect();
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        console.log(`📥 [API] Cédula ${cedula} encolada.`);
        res.json({ status: "Enviado", cedula });
    } catch (error) {
        res.status(500).json({ error: "Error de Redis" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 API en puerto ${PORT}`));
