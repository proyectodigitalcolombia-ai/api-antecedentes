const express = require('express');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const client = redis.createClient({ url: process.env.REDIS_URL });
client.on('error', (err) => console.log('Redis Client Error', err));

async function startApi() {
    await client.connect();
    console.log('🚀 API de Inteligencia Masiva conectada a Redis');

    app.post('/consultar', async (req, res) => {
        const { cedula, nombre, apellido } = req.body;

        // Validación de datos mínimos
        if (!cedula || !nombre || !apellido) {
            return res.status(400).json({ 
                error: 'Faltan datos. Se requiere: cedula, nombre y apellido.' 
            });
        }

        const consultaId = uuidv4();
        const payload = {
            id: consultaId,
            cedula,
            nombre: nombre.toUpperCase(),
            apellido: apellido.toUpperCase(),
            timestamp: new Date().toISOString()
        };

        try {
            // Enviamos la tarea a la cola de Redis
            await client.lPush('cola_consultas', JSON.stringify(payload));
            
            res.status(202).json({
                mensaje: 'Consulta masiva iniciada',
                consultaId,
                fuentes_activas: ['Policia_COL', 'Interpol_RED', 'OFAC_Clinton', 'UE_Sanciones'],
                estado: 'En cola'
            });
        } catch (error) {
            res.status(500).json({ error: 'Error al encolar consulta' });
        }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`📡 API escuchando en puerto ${PORT}`));
}

startApi();
