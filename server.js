import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { products, createSession, view, action } from './src/formulation.js';
const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = resolve(root, 'public');
const dataFile = resolve(process.env.DATA_FILE || resolve(root, 'data/sessions.json'));
let state;
try {
  state = JSON.parse(await readFile(dataFile, 'utf8'));
  if (state.version !== 1 || !Array.isArray(state.sessions) || !Number.isInteger(state.nextId)) throw new Error('Formato de datos inválido');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  state = { version: 1, nextId: 1, sessions: [] };
}
async function persist(next) {
  await mkdir(dirname(dataFile), { recursive: true });
  await writeFile(`${dataFile}.tmp`, JSON.stringify(next, null, 2), 'utf8');
  await rename(`${dataFile}.tmp`, dataFile);
  state = next;
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 16384) throw new Error('Solicitud demasiado grande.');
  }
  try { return text ? JSON.parse(text) : {}; } catch { throw new Error('JSON inválido.'); }
}
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
async function api(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/products') return json(res, 200, products);
  if (req.method === 'GET' && pathname === '/api/sessions') return json(res, 200, state.sessions.map(view));
  if (req.method === 'POST' && pathname === '/api/sessions') {
    const session = createSession(await body(req), state.nextId);
    await persist({ ...state, nextId: state.nextId + 1, sessions: [...state.sessions, session] });
    return json(res, 201, view(session));
  }
  const match = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(simulate|zero|record|reset|finish))?$/);
  if (match) {
    const index = state.sessions.findIndex(s => s.id === match[1]);
    if (index < 0) return json(res, 404, { error: 'Formulación inexistente.' });
    if (req.method === 'GET' && !match[2]) return json(res, 200, view(state.sessions[index]));
    if (req.method === 'POST' && match[2]) {
      const session = structuredClone(state.sessions[index]);
      action(session, match[2], await body(req));
      const next = structuredClone(state);
      next.sessions[index] = session;
      await persist(next);
      return json(res, 200, view(session));
    }
  }
  if (req.method === 'GET' && pathname === '/api/export.csv') {
    const rows = [['formulacion', 'producto_sap', 'material', 'peso_kg', 'objetivo_kg', 'tolerancia_pct', 'operador', 'fecha', 'estado']];
    for (const s of state.sessions) for (const e of s.entries) rows.push([s.id, s.productCode, e.material, e.weightKg, e.targetKg, e.tolerancePct, s.operator, e.recordedAt, e.voidedAt ? 'ANULADO' : 'VIGENTE']);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="pesadas.csv"' });
    return res.end('\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n'));
  }
  return json(res, 404, { error: 'Ruta no encontrada.' });
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
let queue = Promise.resolve();
const server = http.createServer((req, res) => {
  queue = queue.then(async () => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url.pathname);
      const file = resolve(publicDir, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(publicDir + sep)) return json(res, 403, { error: 'Acceso denegado.' });
      let content;
      try { content = await readFile(file); } catch { return json(res, 404, { error: 'Recurso no encontrado.' }); }
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
      res.end(content);
    } catch (error) {
      if (error.code) console.error(error);
      json(res, error.code ? 500 : 400, { error: error.code ? 'No se pudo guardar la operación. Revisá el servidor.' : error.message });
    }
  }).catch(console.error);
});
const host = process.env.HOST || '127.0.0.1';
server.listen(Number(process.env.PORT || 3000), host, () => console.log(`Balanza local: http://${host}:${server.address().port}`));
