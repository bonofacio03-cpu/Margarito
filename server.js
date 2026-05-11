/**
 * server.js — Servidor principal de Margarito
 *
 * Qué hace:
 *   - Sirve los archivos estáticos (index.html, grafo.html, style.css)
 *   - Expone tres rutas REST:
 *       POST /api/login   → valida contraseña y devuelve un token de sesión
 *       GET  /api/graph   → devuelve el grafo guardado en data.json (público)
 *       POST /api/graph   → sobreescribe data.json (requiere token válido)
 *
 * Seguridad:
 *   El token se genera en memoria al hacer login. Si el servidor se reinicia,
 *   el token se invalida automáticamente. No se usa ninguna librería JWT externa.
 */

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = 3000;

const DATA_FILE     = path.join(__dirname, 'data.json');
const ADMIN_PASSWORD = 'margarito123'; // Cambia esto en producción

// Token activo en memoria. null = nadie ha iniciado sesión.
let currentAdminToken = null;

app.use(express.json());
app.use(express.static(__dirname));

// ── POST /api/login ─────────────────────────────────────────────────────────
// Recibe { password }. Si es correcta, genera y devuelve un token único.
app.post('/api/login', (req, res) => {
    const { password } = req.body;

    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
    }

    // Token simple: string aleatorio + timestamp para evitar colisiones
    currentAdminToken = Math.random().toString(36).substring(2) + Date.now();
    res.json({ success: true, token: currentAdminToken });
});

// ── GET /api/graph ───────────────────────────────────────────────────────────
// Devuelve el grafo completo. Acceso público (todos pueden ver el grafo).
app.get('/api/graph', (req, res) => {
    if (!fs.existsSync(DATA_FILE)) {
        return res.json({ nodes: [], edges: [] });
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    res.json(JSON.parse(raw));
});

// ── POST /api/graph ──────────────────────────────────────────────────────────
// Guarda el estado del grafo. Solo el admin (con token válido) puede hacerlo.
app.post('/api/graph', (req, res) => {
    const userToken = req.headers['authorization'];

    if (!currentAdminToken || userToken !== currentAdminToken) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Servidor Margarito corriendo en http://localhost:${PORT}`);
});
