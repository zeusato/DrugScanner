import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import identifyHandler from './api/identify.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API route
// We do not use body-parser or express.json() here because
// api/identify.js typically expects to read the raw request stream.
app.all('/api/identify', async (req, res) => {
    try {
        await identifyHandler(req, res);
    } catch (error) {
        console.error('API Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
