const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { backgroundCheckQueue } = require('./queue');

const app = express();
app.use(express.json());

app.post('/api/launch', async (req, res) => {
    const { doc, typedoc, webhook_url } = req.body;
    const jobId = uuidv4();

    await backgroundCheckQueue.add('verificar-doc', { jobId, doc, typedoc, webhook_url });

    res.status(202).json({ jobid: jobId, status: "processing" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`));