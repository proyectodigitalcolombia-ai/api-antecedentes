const express = require('express');
const { createClient } = require('redis');
const app = express();
const PORT = process.env.PORT || 10000;

// Configuración de Redis
const client = createClient({
    url: process.env.REDIS_URL
});

client.on('error', (err) => console.log('❌ Error en Redis:', err));

async function conectar() {
    try {
        await client.connect();
        console.log('✅ API conectada a Redis');
    } catch (err) {
        console.error('🚀 Error conectando a Redis:', err);
    }
}
conectar();

// Ruta para que Render sepa que la API está viva
app.get('/', (req, res) => {
    res.send('Servidor de Antecedentes Activo 🚀');
});

// Ruta para recibir la cédula: Ej: /consultar?cedula=12345
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;

    if (!cedula) {
        return res.status(400).json({ error: 'Falta la cédula' });
    }

    try {
        await client.lPush('tareas_antecedentes', JSON.stringify({
            cedula,
            fecha: new Date().toISOString()
        }));
        console.log(`📩 Cédula encolada: ${cedula}`);
        res.json({ mensaje: 'Consulta en proceso', cedula });
    } catch (error) {
        res.status(500).json({ error: 'Error al encolar' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor API corriendo en puerto ${PORT}`);
});
