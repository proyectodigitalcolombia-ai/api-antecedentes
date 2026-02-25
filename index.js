const express = require('express');
const redis = require('redis');
const app = express();

// Configuración de Redis
const client = redis.createClient({
    url: process.env.REDIS_URL
});

client.on('error', (err) => console.error('❌ Error en Redis:', err));
client.on('connect', () => console.log('✅ Conectado a Redis'));

// Ruta de Salud (VITAL para Render)
app.get('/', (req, res) => {
    res.status(200).send('API Antecedentes Operativa ✅');
});

// Ruta para recibir las cédulas
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;

    if (!cedula) {
        return res.status(400).json({ error: "Falta la cédula. Ejemplo: /consultar?cedula=123" });
    }

    try {
        if (!client.isOpen) await client.connect();

        const tarea = JSON.stringify({
            cedula,
            timestamp: new Date().toISOString()
        });

        // Enviamos a la cola que el worker escucha
        await client.lPush('cola_consultas', tarea);

        res.json({
            ok: true,
            mensaje: `Cédula ${cedula} enviada exitosamente.`,
            estado: "En cola"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error de conexión con el backend." });
    }
});

// Puerto dinámico para Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API escuchando en el puerto ${PORT}`);
});
