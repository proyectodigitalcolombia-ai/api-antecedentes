const express = require('express');
const app = express();

// Esta ruta DEBE responder si el código subió
app.get('/', (req, res) => {
    res.send("CONEXIÓN EXITOSA - CÓDIGO ACTUALIZADO");
});

app.listen(process.env.PORT || 10000, '0.0.0.0', () => {
    console.log("Servidor en línea");
});
