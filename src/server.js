const express = require('express');
const Bull = require('bull');

const app = express();
const PORT = process.env.PORT || 10000;

// 1. Configuración de la cola con soporte para Redis en Render (TLS)
// Es importante que REDIS_URL sea la "External Connection String" (rediss://)
const REDIS_URL = process.env.REDIS_URL;

const backgroundCheckQueue = new Bull('background-check-queue', REDIS_URL, {
    redis: {
        tls: {
            rejectUnauthorized: false // Permite la conexión segura en Render
        }
    }
});

app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('✅ API Principal de Antecedentes en línea y protegida.');
});

// 2. Ruta para recibir la consulta
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;

    if (!cedula) {
        return res.status(400).json({ error: 'Falta la cédula en la URL. Ejemplo: /consultar?cedula=12345' });
    }

    try {
        // Agregamos la tarea a la cola de Redis
        await backgroundCheckQueue.add({ cedula });
        
        console.log(`📩 Tarea recibida para cédula: ${cedula}`);
        
        res.json({
            mensaje: `Consulta para la cédula ${cedula} recibida y en proceso.`,
            estado: "Enviado al bot"
        });
    } catch (error) {
        console.error('❌ Error al conectar con Redis:', error);
        res.status(500).json({ error: 'Error de conexión con el servidor de tareas (Redis)' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 API principal escuchando en puerto ${PORT}`);
});
