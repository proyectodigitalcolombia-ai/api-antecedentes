const express = require('express');
const redis = require('redis');
const app = express();

// Configuración de la conexión a Redis
const client = redis.createClient({
    url: process.env.REDIS_URL
});

client.on('error', (err) => console.error('❌ Error en Redis:', err));
client.on('connect', () => console.log('✅ Conectado a Redis con éxito'));

// RUTA RAÍZ: Para que al entrar a https://tu-api.onrender.com/ diga algo
app.get('/', (req, res) => {
    res.status(200).send('API Antecedentes Operativa ✅ (Usa /consultar?cedula=XXX)');
});

// RUTA DE CONSULTA: Esta es la que estabas probando
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;

    if (!cedula) {
        return res.status(400).json({ 
            ok: false, 
            error: "Debes proporcionar una cédula. Ejemplo: /consultar?cedula=12345" 
        });
    }

    try {
        if (!client.isOpen) await client.connect();

        const tarea = JSON.stringify({
            cedula: cedula,
            timestamp: new Date().toISOString()
        });

        // Metemos la tarea en la cola para el Worker
        await client.lPush('cola_consultas', tarea);

        console.log(`📥 Cédula ${cedula} recibida y enviada a Redis`);

        res.json({
            ok: true,
            mensaje: `Cédula ${cedula} recibida. El Worker está procesándola.`,
            cedula: cedula
        });

    } catch (error) {
        console.error("❌ Error enviando a Redis:", error);
        res.status(500).json({ ok: false, error: "Error de conexión con la base de datos de tareas." });
    }
});

// Puerto obligatorio para Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API corriendo en el puerto ${PORT}`);
});
