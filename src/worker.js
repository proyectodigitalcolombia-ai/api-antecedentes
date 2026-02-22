const { createClient } = require('redis');

// Configuración idéntica a la del servidor
const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        connectTimeout: 10000
    }
});

client.on('error', (err) => console.log('❌ Error en Redis Worker:', err));

async function iniciarWorker() {
    try {
        await client.connect();
        console.log('✅ Bot conectado a Redis. Esperando tareas...');

        // Bucle infinito para procesar tareas
        while (true) {
            try {
                // brPop espera hasta que haya algo en la lista 'tareas_antecedentes'
                // El '0' significa que esperará indefinidamente sin cerrarse
                const tareaRaw = await client.brPop('tareas_antecedentes', 0);
                
                if (tareaRaw) {
                    const datos = JSON.parse(tareaRaw.element);
                    console.log(`🤖 Procesando consulta para la cédula: ${datos.cedula}`);

                    // --- AQUÍ VA TU LÓGICA DE PUPPETEER / SCRAPPING ---
                    // Ejemplo: await buscarEnPagina(datos.cedula);
                    
                    console.log(`✅ Finalizado proceso de cédula: ${datos.cedula}`);
                }
            } catch (err) {
                console.error('❌ Error al procesar una tarea individual:', err);
            }
        }
    } catch (err) {
        console.error('🚀 Error crítico en el inicio del Worker:', err);
        // Intentar reiniciar el worker tras un error grave
        setTimeout(iniciarWorker, 5000);
    }
}

iniciarWorker();
