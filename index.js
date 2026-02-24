const express = require('express');
const redis = require('redis');
const app = express();

// Puerto dinámico para Render (10000 por defecto)
const PORT = process.env.PORT || 10000;

// Configuración de Redis usando la variable de entorno de Render
const client = redis.createClient({ 
    url: process.env.REDIS_URL 
});

client.on('error', err => console.log('Error en Redis:', err));

app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;

    if (!cedula) {
        return res.status(400).send({ error: 'Debes proporcionar una cédula. Ejemplo: /consultar?cedula=123' });
    }

    try {
        if (!client.isOpen) await client.connect();

        // Metemos la cédula en una lista llamada 'cola_consultas'
        await client.lPush('cola_consultas', cedula);

        res.send({ 
            ok: true, 
            mensaje: `Cédula ${cedula} recibida correctamente. El Bot comenzará el proceso en breve.` 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Error interno conectando con la base de datos.' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ API Principal funcionando en el puerto ${PORT}`);
});
