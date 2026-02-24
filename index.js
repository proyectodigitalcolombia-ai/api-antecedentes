const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());

// Conexión a Redis
const client = redis.createClient({ url: process.env.REDIS_URL });
client.on('error', (err) => console.log('❌ Redis Error:', err));

app.all('/consultar', async (req, res) => {
    const cedula = req.query.cedula || req.body.cedula;

    if (!cedula) {
        return res.status(400).json({ error: "Falta la cédula. Usa: /consultar?cedula=123" });
    }

    try {
        if (!client.isOpen) await client.connect();
        
        // Ponemos la cédula en la "cola_consultas"
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        
        console.log(`📥 [API] Cédula ${cedula} enviada al Worker.`);
        res.json({ status: "Procesando", cedula });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error de conexión con Redis" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 API en puerto ${PORT}`));
