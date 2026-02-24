const express = require('express');
const redis = require('redis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de Redis
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const NOMBRE_COLA = 'cola_consultas';

const redisClient = redis.createClient({ url: REDIS_URL });

redisClient.on('error', (err) => console.error('❌ Error en Redis (API):', err));

// Conexión inicial
(async () => {
    try {
        await redisClient.connect();
        console.log("🚀 API conectada a Redis exitosamente");
    } catch (err) {
        console.error("🚨 Error de conexión en API:", err);
    }
})();

// Endpoint para recibir la cédula
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;

    if (!cedula) {
        return res.status(400).json({ error: "Falta el parámetro 'cedula'" });
    }

    try {
        const tarea = {
            cedula: cedula,
            timestamp: new Date().toISOString()
        };

        // Empujar la tarea a la cola que el Worker escucha
        await redisClient.rPush(NOMBRE_COLA, JSON.stringify(tarea));
        
        console.log(`📡 Cédula ${cedula} enviada al Worker.`);

        res.status(200).json({
            ok: true,
            mensaje: "Consulta en cola. El bot está procesando.",
            cedula
        });
    } catch (error) {
        res.status(500).json({ error: "Error al conectar con la cola de tareas." });
    }
});

// Puerto para Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`✅ API Principal corriendo en el puerto ${PORT}`);
});
