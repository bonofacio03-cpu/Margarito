const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// --- CAMBIO 1: Configuración de seguridad ---
const ADMIN_PASSWORD = "margarito123"; 
let currentAdminToken = null; // Aquí se guardará la "llave" temporal

app.use(express.json());
app.use(express.static(__dirname));

// --- CAMBIO 2: Nueva ruta para el Login ---
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        // Generamos un token único para esta sesión
        currentAdminToken = Math.random().toString(36).substring(2) + Date.now();
        res.json({ success: true, token: currentAdminToken });
    } else {
        res.status(401).json({ success: false, message: "Password incorrecto" });
    }
});

// Leer datos (Sigue siendo público para que todos vean el grafo)
app.get('/api/graph', (req, res) => {
    if (!fs.existsSync(DATA_FILE)) return res.json({ nodes: [], edges: [] });
    const data = fs.readFileSync(DATA_FILE);
    res.json(JSON.parse(data));
});

// Guardar datos (AHORA PROTEGIDO)
app.post('/api/graph', (req, res) => {
    // --- CAMBIO 3: Validación del Token ---
    const userToken = req.headers['authorization'];
    
    if (!currentAdminToken || userToken !== currentAdminToken) {
        return res.status(403).json({ success: false, message: "No autorizado" });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Servidor Margarito corriendo en http://localhost:${PORT}`);
});
