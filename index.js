const express = require('express');
const redis = require('redis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const REDIS_URL = process.env.REDIS_URL || 'redis://default:xU5AJJoh3pN1wo9dQqExFAiKJgKUFM0T@red-d6d4md5m5p6s73f5i2jg:6379';
const redisClient = redis.createClient({ url: REDIS_URL });

redisClient.on('error', (err) => console.error('❌ Error Redis API:', err));

(async () => {
    await redisClient.connect();
    console.log("🚀 API conectada a Redis");
})();

// Ruta de salud para Render
app.get('/', (req, res) => res.send('API Principal Live'));

// 1. Endpoint para mandar la cédula al Bot
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;
    if (!cedula) return res.status(400).json({ error: "Falta cédula" });

    try {
        const tarea = { cedula, timestamp: new Date().toISOString() };
        await redisClient.rPush('cola_consultas', JSON.stringify(tarea));
        
        // Limpiamos resultados anteriores de esa cédula para evitar confusiones
        await redisClient.del(`resultado:${cedula}`);

        res.json({ ok: true, mensaje: "Consulta en proceso", cedula });
    } catch (error) {
        res.status(500).json({ error: "Error al encolar" });
    }
});

// 2. Endpoint para obtener el resultado final
app.get('/resultado/:cedula', async (req, res) => {
    const { cedula } = req.params;
    try {
        const data = await redisClient.get(`resultado:${cedula}`);
        if (!data) return res.json({ estado: "procesando", mensaje: "El bot sigue trabajando..." });
        
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: "Error al consultar" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ API en puerto ${PORT}`));
