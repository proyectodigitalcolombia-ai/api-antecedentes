const express = require('express');
const { createClient } = require('redis');

const app = express();
const client = createClient({ url: process.env.REDIS_URL });

client.on('error', err => console.log('Redis Client Error', err));

async function startServer() {
    await client.connect();

    // RUTA 1: Para ordenar la consulta
    app.get('/consultar', async (req, res) => {
        const { cedula } = req.query;
        if (!cedula) return res.status(400).send('Falta la cédula');

        // Enviamos la tarea a la cola
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        
        res.json({ 
            mensaje: 'Consulta recibida y en proceso', 
            cedula,
            instrucciones: `Espera unos 60 segundos y visita /resultado?cedula=${cedula}`
        });
    });

    // RUTA 2: Para ver el resultado guardado por el Bot
    app.get('/resultado', async (req, res) => {
        const { cedula } = req.query;
        if (!cedula) return res.status(400).send('Falta la cédula');

        // Buscamos en Redis el resultado que guardó el Bot
        const resultado = await client.get(`resultado:${cedula}`);

        if (resultado) {
            res.json({
                cedula,
                estado: 'Completado',
                datos: resultado
            });
        } else {
            res.json({
                cedula,
                estado: 'En espera',
                mensaje: 'El bot aún está trabajando o la consulta no existe.'
            });
        }
    });

    const PORT = process.env.PORT || 10000;
    app.listen(PORT, () => {
        console.log(`🚀 API escuchando en puerto ${PORT}`);
    });
}

startServer();
