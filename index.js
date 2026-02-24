const express = require('express');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const client = redis.createClient({ url: process.env.REDIS_URL });

async function startApi() {
    await client.connect();
    console.log('🚀 API de Inteligencia conectada');

    app.post('/consultar', async (req, res) => {
        const { cedula } = req.body;

        if (!cedula) return res.status(400).json({ error: 'Cédula requerida' });

        const consultaId = uuidv4();
        const payload = { id: consultaId, cedula, timestamp: new Date().toISOString() };

        await client.lPush('cola_consultas', JSON.stringify(payload));
        
        res.status(202).json({
            mensaje: 'Consulta masiva iniciada solo con cédula',
            consultaId,
            estado: 'El bot está identificando el nombre en la base de datos nacional...'
        });
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`📡 API escuchando en ${PORT}`));
}

startApi();
