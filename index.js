const redis = require('redis');
const http = require('http');

const REDIS_URL = 'redis://default:xU5AJJoh3pN1wo9dQqExFAiKJgKUFM0T@red-d6d4md5m5p6s73f5i2jg:6379';
const NOMBRE_COLA = 'cola_consultas';

const client = redis.createClient({ 
    url: REDIS_URL,
    socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 1000) } 
});

client.on('error', (err) => console.log('❌ Error en Redis del Bot:', err));

// Servidor para que Render lo mantenga en VERDE
http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot de Antecedentes Activo");
}).listen(10000);

async function iniciarBot() {
    await client.connect();
    console.log("🚀 BOT CONECTADO A REDIS. Escuchando tareas...");

    while (true) {
        try {
            // USAMOS BLPOP: Se queda esperando hasta que llegue algo
            // Es más eficiente que RPOP
            const item = await client.blPop(NOMBRE_COLA, 0); 
            
            if (item) {
                const datos = JSON.parse(item.element);
                console.log(`🔎 TRABAJO RECIBIDO: Procesando cédula ${datos.cedula}`);
                
                // Aquí irá tu código de Puppeteer
                console.log("✅ Proceso completado.");
            }
        } catch (error) {
            console.error("🚨 Error al leer de la cola:", error);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 seg antes de reintentar
        }
    }
}

iniciarBot();
