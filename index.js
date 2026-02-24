const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());

// Conector de Redis
const client = redis.createClient({ url: process.env.REDIS_URL });
client.on('error', (err) => console.log('Redis Client Error', err));

// Ruta de consulta (Soporta POST y GET para tu comodidad)
app.all('/consultar', async (req, res) => {
    const cedula = req.query.cedula || req.body.cedula;

    if (!cedula) {
        return res.status(400).json({ error: "Debes proporcionar una cédula. Ej: /consultar?cedula=123" });
    }

    try {
        if (!client.isOpen) await client.connect();
        
        // Enviamos la tarea a la cola
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        
        console.log(`📥 Cédula ${cedula} enviada a la cola.`);
        res.json({ 
            status: "Enviado", 
            mensaje: "El bot está procesando la consulta. Revisa los logs del Worker.",
            cedula 
        });
    } catch (error) {
        res.status(500).json({ error: "Error de conexión con Redis" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 API Principal corriendo en puerto ${PORT}`);
});
