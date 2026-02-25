const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());

// Configurar Redis
const client = redis.createClient({ url: process.env.REDIS_URL });
client.on('error', (err) => console.log('Redis Error', err));

// RUTA DE SALUD (Para que Render sepa que la API está viva)
app.get('/health', (req, res) => res.status(200).send('API OK'));

// RUTA DE CONSULTA (Acepta GET y POST)
app.all('/consultar', async (req, res) => {
    // Busca la cédula en la URL (?cedula=...) o en el cuerpo del JSON
    const cedula = req.query.cedula || req.body.cedula;
    
    if (!cedula) {
        return res.status(400).json({ 
            error: "Falta la cédula", 
            ejemplo: "https://api-antecedentes.onrender.com/consultar?cedula=12345" 
        });
    }

    try {
        if (!client.isOpen) await client.connect();
        
        // Enviar a la cola de Redis
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        
        console.log(`✅ Cédula ${cedula} encolada exitosamente.`);
        res.json({ 
            status: "Encolado", 
            cedula: cedula,
            mensaje: "El worker está procesando la imagen ahora mismo." 
        });
    } catch (e) {
        console.error("Error en Redis:", e);
        res.status(500).json({ error: "Error de conexión con la base de datos" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Principal corriendo en puerto ${PORT}`);
});
