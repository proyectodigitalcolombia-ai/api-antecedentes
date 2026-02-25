const express = require('express');
const redis = require('redis');
const app = express();

// Configuración de Redis con la URL de entorno
const client = redis.createClient({
    url: process.env.REDIS_URL
});

client.on('error', (err) => console.error('❌ Error en Redis:', err));
client.on('connect', () => console.log('✅ API conectada a Redis correctamente'));

// 1. RUTA DE PRUEBA (Para verificar si el servidor responde)
app.get('/', (req, res) => {
    res.send('<h1>API Antecedentes Operativa ✅</h1><p>Usa /consultar?cedula=123</p>');
});

// 2. RUTA DE CONSULTA (La que necesitas)
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;
    console.log(`📩 Petición recibida para cédula: ${cedula}`);

    if (!cedula) {
        return res.status(400).json({ error: "Falta el parámetro 'cedula'" });
    }

    try {
        if (!client.isOpen) await client.connect();

        const tarea = JSON.stringify({
            cedula,
            timestamp: new Date().toISOString()
        });

        // Enviamos a la cola que el worker ya está escuchando
        await client.lPush('cola_consultas', tarea);
        
        console.log(`🚀 Cédula ${cedula} enviada a Redis exitosamente`);

        res.json({
            ok: true,
            mensaje: `Cédula ${cedula} en cola de procesamiento.`,
            status: "Enviado al Worker"
        });
    } catch (error) {
        console.error("❌ Error procesando consulta:", error);
        res.status(500).json({ error: "Error interno conectando con Redis" });
    }
});

// Forzar el puerto 10000 para Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API activa y escuchando en puerto ${PORT}`);
});
