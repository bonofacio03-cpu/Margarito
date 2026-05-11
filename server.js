/**
 * server.js — Servidor principal de Margarito (v2)
 *
 * Cambios respecto a v1:
 *   - Persistencia real en MongoDB Atlas (resiste deploys y reinicios)
 *   - Contraseña en variable de entorno (nunca en código)
 *   - Token criptográficamente seguro (crypto.randomBytes)
 *   - Comparación de tokens con timingSafeEqual (evita timing attacks)
 *   - Rate limiting en /api/login (máx 10 intentos / 15 min)
 *   - Validación de payload antes de escribir en la DB
 *   - Async/await en todas las operaciones de DB
 *   - Cabecera Authorization estándar: "Bearer <token>"
 *
 * Variables de entorno necesarias (añadir en Render → Environment):
 *   ADMIN_PASSWORD   Contraseña del administrador
 *   MONGODB_URI      URI de conexión a MongoDB Atlas
 *                    Ejemplo: mongodb+srv://user:pass@cluster.mongodb.net/margarito
 */

const express   = require('express');
const crypto    = require('crypto');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');

// ── Validación de entorno al arrancar ────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const MONGODB_URI    = process.env.MONGODB_URI;

if (!ADMIN_PASSWORD) {
    console.error('ERROR: La variable de entorno ADMIN_PASSWORD no está definida.');
    process.exit(1);
}
if (!MONGODB_URI) {
    console.error('ERROR: La variable de entorno MONGODB_URI no está definida.');
    process.exit(1);
}

// ── Conexión a MongoDB ────────────────────────────────────────────────────────
const client = new MongoClient(MONGODB_URI);
let graphCollection;

async function connectDB() {
    await client.connect();
    const db      = client.db('margarito');
    graphCollection = db.collection('graph');
    console.log('Conectado a MongoDB Atlas.');
}

// ── App Express ───────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Token activo en memoria.
// Si el servidor se reinicia, cualquier sesión abierta queda invalidada.
let currentAdminToken = null;

// ── Rate limiter: solo para /api/login ───────────────────────────────────────
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max:      10,              // máx 10 intentos por ventana
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'Demasiados intentos. Espera 15 minutos.' }
});

// ── POST /api/login ───────────────────────────────────────────────────────────
app.post('/api/login', loginLimiter, (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ success: false, message: 'Contraseña requerida.' });
    }

    // Comparación en tiempo constante para evitar timing attacks
    const inputBuf    = Buffer.from(password);
    const expectedBuf = Buffer.from(ADMIN_PASSWORD);

    const passwordsMatch =
        inputBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(inputBuf, expectedBuf);

    if (!passwordsMatch) {
        return res.status(401).json({ success: false, message: 'Contraseña incorrecta.' });
    }

    // Token criptográficamente seguro
    currentAdminToken = crypto.randomBytes(32).toString('hex');
    res.json({ success: true, token: currentAdminToken });
});

// ── Middleware de autenticación ───────────────────────────────────────────────
function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'] ?? '';
    const userToken  = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    if (!userToken || !currentAdminToken) {
        return res.status(403).json({ success: false, message: 'No autorizado.' });
    }

    // timingSafeEqual requiere buffers del mismo tamaño
    const userBuf    = Buffer.from(userToken);
    const currentBuf = Buffer.from(currentAdminToken);

    if (userBuf.length !== currentBuf.length || !crypto.timingSafeEqual(userBuf, currentBuf)) {
        return res.status(403).json({ success: false, message: 'Token inválido.' });
    }

    next();
}

// ── GET /api/graph ────────────────────────────────────────────────────────────
// Público: cualquiera puede leer el grafo.
app.get('/api/graph', async (req, res) => {
    try {
        const doc = await graphCollection.findOne({ _id: 'main' });
        if (!doc) return res.json({ nodes: [], edges: [] });

        res.json({ nodes: doc.nodes, edges: doc.edges });
    } catch (err) {
        console.error('Error leyendo grafo:', err);
        res.status(500).json({ error: 'Error interno al leer el grafo.' });
    }
});

// ── POST /api/graph ───────────────────────────────────────────────────────────
// Privado: solo el admin puede sobreescribir el grafo.
app.post('/api/graph', requireAdmin, async (req, res) => {
    const { nodes, edges } = req.body;

    // Validación mínima del payload
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
        return res.status(400).json({ success: false, message: 'Payload inválido: se esperan arrays nodes y edges.' });
    }

    try {
        // upsert: crea el documento si no existe, lo reemplaza si existe
        await graphCollection.replaceOne(
            { _id: 'main' },
            { _id: 'main', nodes, edges, updatedAt: new Date() },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error guardando grafo:', err);
        res.status(500).json({ success: false, message: 'Error interno al guardar.' });
    }
});

// ── Arranque ──────────────────────────────────────────────────────────────────
connectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor Margarito corriendo en http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('No se pudo conectar a MongoDB:', err);
        process.exit(1);
    });