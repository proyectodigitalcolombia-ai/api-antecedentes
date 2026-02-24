const express = require('express');
const redis = require('redis');
const app = express();
const PORT = process.env.PORT || 10000;

// Configuración de conexión a Redis
const client = redis.createClient({ 
    url: process.env.REDIS_URL,
    socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 2000) }
});

client.on('error', err => console.log('❌ Error en Redis:', err));

app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;
    if (!cedula) return res.status(400).send({ error: 'Falta la cédula en la URL' });

    try {
        if (!client.isOpen) await client.connect();
        
        // Empujamos la cédula a la lista 'cola_consultas'
        await client.lPush('cola_consultas', cedula);
        
        res.send({ 
            status: "Recibido", 
            mensaje: `La cédula ${cedula} ha sido enviada al Bot.` 
        });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`🚀 API Principal lista en puerto ${PORT}`));
