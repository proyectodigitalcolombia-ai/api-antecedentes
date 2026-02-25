const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send("ESTA ES LA VERSION NUEVA - SI LEES ESTO, YA ACTUALIZÓ");
});

app.get('/health', (req, res) => res.send("OK"));

app.all('/consultar', (req, res) => {
    res.json({ mensaje: "Ruta consultar funcionando correctamente" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("Servidor iniciado");
});
