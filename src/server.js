const express = require('express');
const { createClient } = require('redis');
const app = express();
const PORT = process.env.PORT || 10000;

// Configuración de Redis con reconexión automática
const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
    }
});

client.on('error', (err) => console.log('❌ Error en Redis:', err));

async function conectarRedis() {
    try {
        await client.connect();
        console.log('✅ API conectada a Redis exitosamente');
    } catch (err) {
        console.error('🚀 Error conectando a Redis:', err);
    }
}
conectarRedis();

// RUTA DE SALUD: Para que Render no marque error en rojo
app.get('/', (req, res) => res.status(200).send('API Funcionando 🚀'));
app.get('/health', (req, res) => res.sendStatus(200));

// RUTA PRINCIPAL DE CONSULTA
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;

    if (!cedula) {
        return res.status(400).json({ error: 'Falta el número de cédula' });
    }

    try {
        // Encolar la tarea en Redis
        await client.lPush('tareas_antecedentes', JSON.stringify({
            cedula,
            timestamp: new Date().toISOString()
        }));
        
        console.log(`📩 Tarea añadida para cédula: ${cedula}`);
        res.json({ 
            status: 'success', 
            message: 'Consulta enviada al bot', 
            cedula 
        });
    } catch (error) {
        console.error('❌ Error al encolar:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
