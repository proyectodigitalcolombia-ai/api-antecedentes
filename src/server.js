const express = require('express');
const { createClient } = require('redis');
const app = express();
const PORT = process.env.PORT || 10000;

// Configuración del cliente de Redis
const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        connectTimeout: 10000 // 10 segundos máximo para conectar
    }
});

client.on('error', (err) => console.log('❌ Error en Redis Client:', err));
client.on('connect', () => console.log('✅ Conectado a Redis exitosamente'));

// Conectar a Redis antes de iniciar el servidor
async function connectRedis() {
    try {
        await client.connect();
    } catch (err) {
        console.error('🚀 Error inicial de conexión a Redis:', err);
    }
}
connectRedis();

app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;

    if (!cedula) {
        return res.status(400).json({ error: 'Falta la cédula' });
    }

    try {
        // Verificamos si Redis está listo antes de enviar la tarea
        if (!client.isOpen) {
            return res.status(500).json({ error: 'La base de datos Redis no está lista' });
        }

        // Enviar la tarea a la cola de Redis (List)
        await client.lPush('tareas_antecedentes', JSON.stringify({
            cedula,
            timestamp: new Date().toISOString()
        }));

        console.log(`📩 Tarea añadida para cédula: ${cedula}`);
        
        res.json({
            mensaje: 'Consulta recibida y en proceso',
            cedula: cedula,
            estado: 'Pendiente'
        });

    } catch (error) {
        console.error('❌ Error al procesar la petición:', error);
        res.status(500).json({ error: 'Error interno al conectar con la cola de trabajo' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
