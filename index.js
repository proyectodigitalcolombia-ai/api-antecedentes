const express = require('express');
const redis = require('redis');
const app = express();
const PORT = process.env.PORT || 10000;

// Conexión a Redis
const client = redis.createClient({
    url: process.env.REDIS_URL
});

client.on('error', (err) => console.log('❌ Error en Redis:', err));

async function connectRedis() {
    await client.connect();
    console.log('🚀 API conectada a Redis');
}
connectRedis();

app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;

    if (!cedula) {
        return res.status(400).json({ error: 'Falta la cédula en la URL' });
    }

    try {
        // Metemos la cédula en la cola de Redis
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        
        console.log(`📥 Cédula ${cedula} enviada a la cola.`);
        
        res.json({
            status: "Recibido",
            mensaje: `La cédula ${cedula} está en cola. Revisa el log del Bot para ver el progreso.`,
            cedula: cedula
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al conectar con la cola' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ API servida en puerto ${PORT}`);
});
