const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());
const client = redis.createClient({ url: process.env.REDIS_URL });

client.on('error', (err) => console.log('Redis Error', err));

app.all('/consultar', async (req, res) => {
    const cedula = req.query.cedula || req.body.cedula;
    
    if (!cedula) {
        return res.status(400).json({ error: "Debe proporcionar una cédula" });
    }

    try {
        if (!client.isOpen) await client.connect();
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        
        res.json({ 
            status: "Encolado", 
            mensaje: `La consulta para ${cedula} está siendo procesada por el worker.` 
        });
    } catch (e) {
        res.status(500).json({ error: "No se pudo conectar con la cola de tareas" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Principal corriendo en puerto ${PORT}`);
});
