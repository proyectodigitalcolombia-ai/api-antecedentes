const express = require('express');
const Bull = require('bull');

const app = express();
const PORT = process.env.PORT || 10000;

// Configuración robusta para Redis en Render
const queueOptions = {
    redis: {
        tls: { rejectUnauthorized: false },
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
        connectTimeout: 20000 // 20 segundos de gracia
    }
};

const backgroundCheckQueue = new Bull('background-check-queue', process.env.REDIS_URL, queueOptions);

app.get('/', (req, res) => res.send('✅ API Principal Online'));

app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;
    if (!cedula) return res.status(400).json({ error: 'Falta la cédula' });

    try {
        // Añadimos la tarea a la cola
        await backgroundCheckQueue.add({ cedula });
        console.log(`📩 Cédula ${cedula} puesta en cola.`);
        
        res.json({
            mensaje: `Consulta para ${cedula} recibida y en proceso.`,
            estado: "Enviado al bot"
        });
    } catch (error) {
        console.error('❌ Error de conexión:', error.message);
        res.status(500).json({ 
            error: 'La API no pudo hablar con Redis.',
            ayuda: 'Revisa que REDIS_URL empiece con rediss://' 
        });
    }
});

app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
