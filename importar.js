const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_FILE = 'conexiones.xlsx'; // Tu archivo Excel
const JSON_FILE = 'data.json';

function importarExcel() {
    try {
        // 1. Leer el Excel
        const workbook = XLSX.readFile(EXCEL_FILE);
        const sheetName = workbook.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

        const elements = { nodes: [], edges: [] };
        const nodosDetectados = new Set();
        const conexionesExistentes = new Set();

        // 2. Procesar filas (saltamos la primera si es encabezado)
        data.forEach((row, index) => {
            if (index === 0) return; // Saltamos encabezados
            
            const a = String(row[0] || '').trim();
            const b = String(row[1] || '').trim();

            if (a && b && a !== b) {
                nodosDetectados.add(a);
                nodosDetectados.add(b);

                // Crear una llave única para la conexión (evita duplicados)
                const edgeId = [a, b].sort().join('-');
                if (!conexionesExistentes.has(edgeId)) {
                    conexionesExistentes.add(edgeId);
                    elements.edges.push({ data: { source: a, target: b } });
                }
            }
        });

        // 3. Crear nodos
        nodosDetectados.forEach(nombre => {
            elements.nodes.push({ data: { id: nombre } });
        });

        // 4. Guardar en data.json
        fs.writeFileSync(JSON_FILE, JSON.stringify(elements, null, 2));
        
        console.log(`✅ Importación exitosa:`);
        console.log(`- Nodos: ${nodosDetectados.size}`);
        console.log(`- Conexiones: ${elements.edges.length}`);

    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

importarExcel();