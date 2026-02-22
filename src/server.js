const express = require('express');
const Bull = require('bull');

const app = express();
const PORT = process.env.PORT || 10000;

// Configuración de Redis con TLS para Render
const REDIS_URL = process.env.REDIS_URL;

const queueOptions = {
    redis: {
        tls: { rejectUnauthorized: false },
        enableReadyCheck: false,
        maxRetriesPerRequest: null
    }
};

const backgroundCheckQueue = new Bull('background-check-queue', REDIS_URL, queueOptions);

app.use(express.json());

app.get('/', (req, res) => {
    res.send('✅ API Principal Funcionando');
});

app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;
    if (!cedula) return res.status(400).json({ error: 'Falta la cédula' });

    try {
        // Añadimos un timeout para que no se quede la página en blanco si Redis no responde
        await backgroundCheckQueue.add({ cedula }, { timeout: 5000 });
        console.log(`📩 Cédula ${cedula} enviada a la cola.`);
        
        res.json({
            mensaje: `Consulta para la cédula ${cedula} recibida.`,
            estado: "En cola"
        });
    } catch (error) {
        console.error('❌ Error de Redis:', error.message);
        res.status(500).json({ error: 'Error al conectar con la base de datos de tareas.' });
    }
});

app.listen(PORT, () => console.log(`🚀 API en puerto ${PORT}`));
