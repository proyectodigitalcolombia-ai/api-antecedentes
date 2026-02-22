const express = require('express');
const Bull = require('bull');
const app = express();

// Configuración de la cola con Redis
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const backgroundCheckQueue = new Bull('background-check-queue', REDIS_URL);

app.use(express.json());

app.get('/', (req, res) => {
    res.send('API de Antecedentes Funcionando Correctamente');
});

// Ruta para recibir consultas
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;
    if (!cedula) return res.status(400).send({ error: 'Cédula requerida' });

    // Añadir a la cola para que el worker la procese
    await backgroundCheckQueue.add({ cedula });
    res.send({ mensaje: `Consulta para la cédula ${cedula} recibida y en proceso.` });
});

// ESCUCHAR EN EL PUERTO CORRECTO
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`API principal escuchando en puerto ${PORT}`);
});
