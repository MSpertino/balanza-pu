import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(root, 'public');

const products = [
  { code: 'SAP-001', name: 'Sólido demostración A', formula: [
    { material: 'MAT-AGUA', name: 'Agua', targetKg: 2.5, toleranceKg: 0.05 },
    { material: 'MAT-RESINA', name: 'Resina base', targetKg: 5, toleranceKg: 0.1 },
    { material: 'MAT-CARGA', name: 'Carga mineral', targetKg: 2.5, toleranceKg: 0.1 }
  ] },
  { code: 'SAP-002', name: 'Sólido demostración B', formula: [
    { material: 'MAT-AGUA', name: 'Agua', targetKg: 1.5, toleranceKg: 0.05 },
    { material: 'MAT-ADITIVO', name: 'Aditivo', targetKg: 0.5, toleranceKg: 0.02 }
  ] }
];

const sessions = new Map();
let nextId = 1;

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
    req.on('error', reject);
  });
}

function sessionView(session) {
  return { ...session, currentWeightKg: Math.max(0, session.simulatedWeightKg - session.zeroOffsetKg) };
}

async function api(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/products') return json(res, 200, products);
  if (req.method === 'GET' && pathname === '/api/sessions') return json(res, 200, [...sessions.values()].map(sessionView));

  if (req.method === 'POST' && pathname === '/api/sessions') {
    const input = await body(req);
    const product = products.find(item => item.code === input.productCode);
    if (!product) return json(res, 400, { error: 'Producto SAP inexistente.' });
    const session = {
      id: `FORM-${String(nextId++).padStart(5, '0')}`,
      productCode: product.code,
      productName: product.name,
      operator: input.operator || 'Operador demo',
      status: 'INICIADA',
      startedAt: new Date().toISOString(),
      zeroOffsetKg: 0,
      simulatedWeightKg: 0,
      lastRecordedScaleKg: 0,
      entries: []
    };
    sessions.set(session.id, session);
    return json(res, 201, sessionView(session));
  }

  const match = pathname.match(/^\/api\/sessions\/([^/]+)\/(zero|simulate|record|finish)$/);
  if (req.method === 'POST' && match) {
    const session = sessions.get(match[1]);
    if (!session) return json(res, 404, { error: 'Formulación inexistente.' });
    const action = match[2];
    const input = await body(req);
    if (action === 'zero') {
      session.zeroOffsetKg = session.simulatedWeightKg;
      session.lastRecordedScaleKg = session.simulatedWeightKg;
    }
    if (action === 'simulate') session.simulatedWeightKg = Number(input.weightKg) || 0;
    if (action === 'record') {
      const weightKg = Number((session.simulatedWeightKg - session.lastRecordedScaleKg).toFixed(3));
      if (weightKg <= 0) return json(res, 400, { error: 'El peso debe ser mayor que cero.' });
      session.entries.push({ id: `P-${session.entries.length + 1}`, material: input.material, weightKg, recordedAt: new Date().toISOString() });
      session.lastRecordedScaleKg = session.simulatedWeightKg;
    }
    if (action === 'finish') session.status = 'FINALIZADA';
    return json(res, 200, sessionView(session));
  }

  if (req.method === 'GET' && pathname === '/api/export.csv') {
    const rows = ['formulacion;producto_sap;material;peso_kg;operador;fecha'];
    for (const s of sessions.values()) for (const e of s.entries) rows.push([s.id, s.productCode, e.material, e.weightKg, s.operator, e.recordedAt].join(';'));
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="pesadas.csv"' });
    return res.end(rows.join('\n'));
  }

  return json(res, 404, { error: 'Ruta no encontrada.' });
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(req, res, url.pathname);
  const relative = url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^[/\\]+/, '');
  const file = join(publicDir, relative);
  if (!file.startsWith(publicDir)) return json(res, 403, { error: 'Acceso denegado.' });
  try { res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)); }
  catch { json(res, 404, { error: 'Recurso no encontrado.' }); }
});

server.listen(3000, '127.0.0.1', () => console.log('Balanza local: http://localhost:3000'));
