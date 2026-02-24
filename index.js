const express = require('express');
const redis = require('redis');
const app = express();

const client = redis.createClient({ url: process.env.REDIS_URL });
client.on('error', (err) => console.error('❌ Error en Redis:', err));

async function connectRedis() {
    await client.connect();
    console.log('✅ API conectada a Redis');
}
connectRedis();

app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;
    if (!cedula) return res.status(400).json({ error: "Falta la cédula" });

    try {
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        res.json({ status: "Recibido", mensaje: `Cédula ${cedula} enviada al Bot.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API lista en puerto ${PORT}`);
});
