const express = require('express');
const { createClient } = require('redis');
const { v4: uuidv4 } = require('uuid');

const app = express();
// --- EL PUERTO QUE RENDER NECESITA PARA PONERSE VERDE ---
const port = process.env.PORT || 10000;

// Configuración de Redis
const REDIS_URL = process.env.REDIS_URL;
const client = createClient({ url: REDIS_URL });

client.on('error', (err) => console.log('🔴 Redis Client Error', err));

async function startServer() {
    await client.connect();
    console.log('✅ Conectado a Redis desde la API');

    app.get('/', (req, res) => {
        res.send('API Principal de Antecedentes - Operativa 🚀');
    });

    // 1. Ruta para recibir la cédula
    app.get('/consultar', async (req, res) => {
        const { cedula } = req.query;
        if (!cedula) return res.status(400).json({ error: 'Falta la cédula' });

        const tarea = { id: uuidv4(), cedula };
        
        // Enviamos a la cola que el Bot está escuchando
        await client.lPush('cola_consultas', JSON.stringify(tarea));
        
        res.json({
            mensaje: "Consulta recibida y en proceso",
            cedula,
            estado: "Pendiente"
        });
    });

    // 2. Ruta para ver el resultado
    app.get('/resultado/:cedula', async (req, res) => {
        const { cedula } = req.params;
        const resultado = await client.get(`resultado:${cedula}`);
        
        if (resultado) {
            res.json({ cedula, estado: "Finalizado", resultado });
        } else {
            res.json({ cedula, estado: "En proceso o no encontrado" });
        }
    });

    // --- IMPORTANTE: ESCUCHAR EN 0.0.0.0 ---
    app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 API Principal escuchando en el puerto ${port}`);
    });
}

startServer();
