const express = require('express');
const { createClient } = require('redis');
const app = express();
const port = process.env.PORT || 10000;

// Configuración de Redis
const client = createClient({
    url: process.env.REDIS_URL
});

client.on('error', (err) => console.log('🔴 Redis Client Error', err));

// Conexión inicial a Redis
async function connectRedis() {
    try {
        await client.connect();
        console.log('✅ Conectado a Redis desde la API');
    } catch (err) {
        console.error('❌ Error conectando a Redis:', err);
    }
}
connectRedis();

// Ruta para recibir la consulta
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;

    if (!cedula) {
        return res.status(400).json({ error: 'Debes proporcionar un número de cédula' });
    }

    try {
        // 1. Borrar cualquier resultado previo para esta cédula para evitar confusiones
        await client.del(`resultado:${cedula}`);

        // 2. Enviar a la cola de Redis (el worker la recogerá)
        const tarea = JSON.stringify({ cedula, timestamp: Date.now() });
        await client.lPush('cola_consultas', tarea);

        console.log(`📡 Cédula ${cedula} enviada a la cola`);

        res.json({
            mensaje: 'Consulta recibida y en proceso',
            cedula,
            instrucciones: `Consulta el estado en: /resultado/${cedula}`
        });
    } catch (err) {
        res.status(500).json({ error: 'Error al procesar la solicitud en Redis' });
    }
});

// Ruta para ver el resultado
app.get('/resultado/:cedula', async (req, res) => {
    const { cedula } = req.params;

    try {
        const resultado = await client.get(`resultado:${cedula}`);

        if (resultado) {
            res.json({ cedula, estado: resultado });
        } else {
            res.json({ 
                cedula, 
                estado: 'Pendiente', 
                detalle: 'El bot aún está procesando la solicitud o resolviendo el captcha. Reintenta en 15 segundos.' 
            });
        }
    } catch (err) {
        res.status(500).json({ error: 'Error al consultar el resultado' });
    }
});

// Ruta de salud
app.get('/', (req, res) => {
    res.send('🚀 API de Antecedentes Activa y Conectada');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 API Principal escuchando en el puerto ${port}`);
});
