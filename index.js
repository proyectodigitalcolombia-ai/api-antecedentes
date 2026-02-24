const express = require('express');
const redis = require('redis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const REDIS_URL = 'redis://default:xU5AJJoh3pN1wo9dQqExFAiKJgKUFM0T@red-d6d4md5m5p6s73f5i2jg:6379';
const NOMBRE_COLA = 'cola_consultas';

const redisClient = redis.createClient({ url: REDIS_URL });

redisClient.on('error', (err) => console.error('❌ Error en Redis (API):', err));

(async () => {
    try {
        await redisClient.connect();
        console.log("🚀 API conectada a Redis exitosamente");
    } catch (err) {
        console.error("🚨 Error de conexión en API:", err);
    }
})();

// 🚩 ESTO ES LO QUE FALTA PARA EL COLOR VERDE
app.get('/', (req, res) => {
    res.status(200).send('API Principal funcionando correctamente');
});

app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;
    if (!cedula) return res.status(400).json({ error: "Falta cédula" });

    try {
        const tarea = { cedula, timestamp: new Date().toISOString() };
        
        // Enviamos a Redis
        await redisClient.rPush(NOMBRE_COLA, JSON.stringify(tarea));
        
        console.log(`📡 Cédula ${cedula} enviada a la cola.`);
        res.status(200).json({ ok: true, mensaje: "Enviado al bot", cedula });
    } catch (error) {
        console.error("Error al enviar:", error);
        res.status(500).json({ error: "Error de conexión con Redis" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`✅ API escuchando en puerto ${PORT}`);
});
