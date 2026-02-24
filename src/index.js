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
    try {
        await redisClient.connect();
        console.log("🚀 API Principal conectada a Redis");
    } catch (err) {
        console.error("🚨 Error conectando API a Redis:", err);
    }
})();

// Ruta para que Render sepa que la API está viva
app.get('/', (req, res) => res.send('API Principal funcionando correctamente.'));

// Recibir cédula: /consultar?cedula=12345
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;
    if (!cedula) return res.status(400).json({ error: "Falta el parámetro cedula" });

    try {
        const tarea = { cedula, timestamp: new Date().toISOString() };
        await redisClient.rPush('cola_consultas', JSON.stringify(tarea));
        
        // Borramos cualquier resultado viejo de esta cédula para evitar datos obsoletos
        await redisClient.del(`resultado:${cedula}`);

        res.json({ ok: true, mensaje: "Consulta en cola. El bot está trabajando.", cedula });
    } catch (error) {
        res.status(500).json({ error: "Error al enviar a la cola" });
    }
});

// Consultar resultado: /resultado/12345
app.get('/resultado/:cedula', async (req, res) => {
    const { cedula } = req.params;
    try {
        const data = await redisClient.get(`resultado:${cedula}`);
        if (!data) return res.json({ estado: "procesando", mensaje: "El bot aún no termina." });
        
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: "Error al consultar Redis" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ API Principal escuchando en puerto ${PORT}`));
