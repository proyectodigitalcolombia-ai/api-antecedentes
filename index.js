const express = require('express');
const redis = require('redis');
const app = express();

const client = redis.createClient({ url: process.env.REDIS_URL });

client.on('error', (err) => console.log('Error en Redis:', err));

async function connect() {
    await client.connect();
    console.log('🚀 API conectada a Redis');
}
connect();

app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;
    if (!cedula) return res.status(400).json({ error: 'Falta la cédula' });

    try {
        // Enviar a la misma cola que escucha el bot: 'cola_consultas'
        await client.lPush('cola_consultas', cedula);
        res.json({ status: 'Recibido', mensaje: `Cédula ${cedula} en cola de procesamiento.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`API servida en puerto ${PORT}`));
