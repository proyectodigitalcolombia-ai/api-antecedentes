const express = require('express');
const { createClient } = require('redis');
const app = express();

// Configuración de Redis
const client = createClient({
    url: process.env.REDIS_URL
});

client.on('error', (err) => console.log('❌ Error en Redis Client', err));

// Middleware para leer JSON
app.use(express.json());

// --- RUTAS ---

// 1. Ruta de Salud (Para que Render se ponga en VERDE)
app.get('/', (req, res) => {
    res.status(200).send('🚀 API Principal: Sistema en línea y escuchando.');
});

// 2. Ruta para recibir consultas
app.get('/consultar', async (req, res) => {
    const { cedula } = req.query;

    if (!cedula) {
        return res.status(400).json({ error: "Falta el número de cédula" });
    }

    try {
        if (!client.isOpen) await client.connect();

        // Enviamos la tarea a la cola de Redis
        await client.lPush('cola_consultas', JSON.stringify({ cedula }));
        
        console.log(`🔔 Cédula ${cedula} añadida a la cola.`);

        res.json({
            mensaje: "Consulta recibida y en proceso",
            cedula: cedula,
            estado: "Pendiente"
        });
    } catch (error) {
        console.error("❌ Error al conectar con Redis:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// 3. Ruta para verificar resultados
app.get('/resultado/:cedula', async (req, res) => {
    const { cedula } = req.params;
    try {
        if (!client.isOpen) await client.connect();
        const resultado = await client.get(`resultado:${cedula}`);
        
        if (resultado) {
            res.json({ cedula, resultado: JSON.parse(resultado) });
        } else {
            res.json({ cedula, estado: "Aún en proceso o no encontrado" });
        }
    } catch (error) {
        res.status(500).json({ error: "Error al obtener resultado" });
    }
});

// --- ARRANQUE DEL SERVIDOR ---

const PORT = process.env.PORT || 10000;

// Escuchamos en 0.0.0.0 para que Render nos vea desde afuera
app.listen(PORT, '0.0.0.0', () => {
    console.log(`--- ✅ SERVIDOR API INICIADO ---`);
    console.log(`🚀 API Principal escuchando en el puerto ${PORT}`);
    console.log(`🔗 URL de prueba: http://localhost:${PORT}/`);
});
