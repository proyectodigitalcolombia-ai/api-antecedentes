const express = require('express');
const redis = require('redis');
const app = express();

const client = redis.createClient({ url: process.env.REDIS_URL });

client.on('error', (err) => console.log('Redis Client Error', err));

app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;
    if (!cedula) return res.status(400).json({ error: "Falta la cédula" });

    try {
        if (!client.isOpen) await client.connect();
        
        // Metemos la cédula en la cola para que el Worker la vea
        await client.lPush('cola_consultas', JSON.stringify({ 
            cedula, 
            timestamp: new Date().toISOString() 
        }));

        res.json({ 
            status: "Encolado", 
            mensaje: `La cédula ${cedula} está siendo procesada por el bot`,
            ver_resultado: `https://api-principal-v2.onrender.com/ver/${cedula}.png`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => res.send('API Operativa ✅'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API escuchando en puerto ${PORT}`);
});
