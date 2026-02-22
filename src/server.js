const express = require('express');
const { createClient } = require('redis');
const app = express();
const PORT = process.env.PORT || 10000;

// Configuración de Redis con tu URL interna funcional
const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        connectTimeout: 10000
    }
});

client.on('error', (err) => console.log('❌ Error en Redis Client:', err));

async function connectRedis() {
    try {
        await client.connect();
        console.log('✅ API conectada a Redis exitosamente');
    } catch (err) {
        console.error('🚀 Error conectando a Redis:', err);
    }
}
connectRedis();

// RUTA DE SALUD (Esto arregla el "Failed Deploy" en la API)
app.get('/', (req, res) => {
    res.status(200).send('API Activa y Funcionando 🚀');
});

// RUTA DE CONSULTA
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;

    if (!cedula) {
        return res.status(400).json({ error: 'Falta la cédula' });
    }

    try {
        if (!client.isOpen) {
            return res.status(500).json({ error: 'Redis no está listo' });
        }

        // Enviar a la cola
        await client.lPush('tareas_antecedentes', JSON.stringify({
            cedula,
            fecha: new Date().toISOString()
        }));

        console.log(`📩 Tarea encolada para cédula: ${cedula}`);
        
        res.json({
            mensaje: 'Consulta recibida y en proceso',
            cedula: cedula
        });

    } catch (error) {
        console.error('❌ Error al procesar:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
