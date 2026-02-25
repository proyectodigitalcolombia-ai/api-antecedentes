const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());

// Configuración de Redis
const client = redis.createClient({ url: process.env.REDIS_URL });
client.on('error', (err) => console.log('Redis Error', err));

// 1. RUTA DE SALUD (Para verificar que el código nuevo subió)
app.get('/test', (req, res) => {
    res.json({ mensaje: "API ACTUALIZADA Y FUNCIONANDO ✅" });
});

// 2. RUTA DE CONSULTA (Acepta GET y POST)
app.all('/consultar', async (req, res) => {
    const cedula = req.query.cedula || req.body.cedula;
    
    if (!cedula) {
        return res.status(400).json({ error: "Falta el parámetro 'cedula'" });
    }

    try {
        if (!client.isOpen) await client.connect();
        
        // Enviamos a la cola de Redis
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        
        res.json({ 
            status: "Encolado", 
            cedula: cedula,
            mensaje: "Tarea enviada al Worker. Revisa la imagen en 20 segundos." 
        });
    } catch (e) {
        res.status(500).json({ error: "Error de conexión con Redis" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API en puerto ${PORT}`);
});
