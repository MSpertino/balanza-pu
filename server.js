import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { products, setProducts, createSession, view, action } from './src/formulation.js';
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
const devicesFile = resolve(process.env.DEVICES_FILE || resolve(root, 'data/devices.json'));
const formulasFile = resolve(process.env.FORMULAS_FILE || resolve(root, 'data/formulas.json'));
try {
  const savedFormulas = JSON.parse(await readFile(formulasFile, 'utf8'));
  if (Array.isArray(savedFormulas) && savedFormulas.length) setProducts(savedFormulas);
} catch (error) {
  if (error.code !== 'ENOENT') console.error(`No se pudieron cargar las fórmulas: ${error.message}`);
}
let deviceState;
try {
  deviceState = JSON.parse(await readFile(devicesFile, 'utf8'));
  if (deviceState.version !== 1 || !Array.isArray(deviceState.devices)) throw new Error('Formato de dispositivos inválido');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  deviceState = { version: 1, devices: [] };
}
const localSerialPath = process.env.SERIAL_PORT || 'COM6';
const localDeviceId = 'balanza-usb-local';
const localDeviceToken = 'local-usb-token';
let localSerialPort;

function ensureLocalDevice() {
  let device = deviceState.devices.find(item => item.deviceId === localDeviceId);
  if (!device) {
    device = { deviceId: localDeviceId, token: localDeviceToken, name: 'Balanza USB local', firmware: 'serial-local', createdAt: new Date().toISOString() };
    deviceState.devices.push(device);
  }
  return device;
}

function ingestSerialLine(line) {
  const text = line.trim();
  if (text) console.log(`USB RAW <- ${text}`);
  if (!text.startsWith('{')) return;
  console.log(`USB JSON <- ${text}`);
  try {
    const input = JSON.parse(text);
    const device = ensureLocalDevice();
    const now = new Date().toISOString();
    const grams = input.g !== null && input.g !== undefined && Number.isFinite(Number(input.g)) ? Number(input.g) : null;
    device.lastSeenAt = now;
    device.latest = {
      weightKg: grams == null ? null : grams / 1000,
      stable: Boolean(input.stable),
      calibrated: Boolean(input.calibrated),
      tared: Boolean(input.tared),
      button: Boolean(input.btn),
      raw: input.raw ?? null,
      uptimeMs: null,
      receivedAt: now,
      source: 'USB'
    };
  } catch { /* Ignorar líneas parciales o mensajes no JSON del monitor. */ }
}

function startLocalSerial() {
  localSerialPort = new SerialPort({ path: localSerialPath, baudRate: 115200, autoOpen: false, rtscts: false, hupcl: false });
  const parser = localSerialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
  parser.on('data', ingestSerialLine);
  localSerialPort.on('error', error => console.error(`Balanza USB ${localSerialPath}: ${error.message}`));
  localSerialPort.open(error => {
    if (error) console.error(`No se pudo abrir ${localSerialPath}. Cerrá el monitor serie para usar la lectura USB local.`);
    else {
      console.log(`Balanza USB local conectada en ${localSerialPath}`);
      // No tocar DTR/RTS: en algunas placas CP210x eso fuerza DOWNLOAD_BOOT.
      setTimeout(() => localSerialPort.write('T\n'), 700);
    }
  });
}
async function persist(next) {
  await mkdir(dirname(dataFile), { recursive: true });
  await writeFile(`${dataFile}.tmp`, JSON.stringify(next, null, 2), 'utf8');
  await rename(`${dataFile}.tmp`, dataFile);
  state = next;
}
async function persistDevices(next) {
  await mkdir(dirname(devicesFile), { recursive: true });
  await writeFile(`${devicesFile}.tmp`, JSON.stringify(next, null, 2), 'utf8');
  await rename(`${devicesFile}.tmp`, devicesFile);
  deviceState = next;
}
async function persistFormulas(next) {
  await mkdir(dirname(formulasFile), { recursive: true });
  await writeFile(`${formulasFile}.tmp`, JSON.stringify(next, null, 2), 'utf8');
  await rename(`${formulasFile}.tmp`, formulasFile);
  setProducts(next);
}
function normalizeFormula(input) {
  const code = String(input.code || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const referencePolyolKg = Number(input.referencePolyolKg);
  const formula = Array.isArray(input.formula) ? input.formula.map(item => ({
    material: String(item.material || '').trim().toUpperCase(),
    name: String(item.name || '').trim(),
    referenceKg: Number(item.referenceKg),
    tolerancePct: Number(item.tolerancePct)
  })) : [];
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) throw new Error('El código SAP debe tener entre 2 y 32 caracteres válidos.');
  if (!name) throw new Error('Ingresá el nombre de la fórmula.');
  if (!Number.isFinite(referencePolyolKg) || referencePolyolKg <= 0) throw new Error('La referencia de poliol debe ser mayor que 0.');
  if (!formula.length) throw new Error('Agregá al menos un material.');
  formula.forEach((item, index) => {
    if (!item.material || !item.name) throw new Error(`Completá el material ${index + 1}.`);
    if (!Number.isFinite(item.referenceKg) || item.referenceKg <= 0) throw new Error(`La cantidad del material ${index + 1} debe ser mayor que 0.`);
    if (!Number.isFinite(item.tolerancePct) || item.tolerancePct < 0 || item.tolerancePct > 100) throw new Error(`La tolerancia del material ${index + 1} debe estar entre 0 y 100%.`);
  });
  return { code, name, referencePolyolKg, formula };
}
function deviceView(device) {
  const lastSeenMs = device.lastSeenAt ? Date.now() - Date.parse(device.lastSeenAt) : Infinity;
  return { ...device, token: undefined, status: lastSeenMs <= 15000 ? 'ONLINE' : device.lastSeenAt ? 'OFFLINE' : 'NUNCA CONECTADO' };
}
function deviceAuth(req, device) {
  const token = req.headers['x-device-token'];
  return typeof token === 'string' && token.length > 0 && token === device.token;
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
  if (req.method === 'GET' && pathname === '/api/devices') return json(res, 200, deviceState.devices.map(deviceView));
  if (req.method === 'POST' && pathname === '/api/devices/register') {
    const input = await body(req);
    const deviceId = String(input.deviceId || '').trim();
    const token = String(input.token || '').trim();
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(deviceId)) return json(res, 400, { error: 'deviceId inválido.' });
    if (token.length < 8) return json(res, 400, { error: 'El token del dispositivo debe tener al menos 8 caracteres.' });
    const existing = deviceState.devices.find(device => device.deviceId === deviceId);
    if (existing && existing.token !== token) return json(res, 401, { error: 'Token de dispositivo incorrecto.' });
    const device = existing || { deviceId, token, name: deviceId, createdAt: new Date().toISOString() };
    device.name = String(input.name || device.name || deviceId).slice(0, 80);
    device.firmware = String(input.firmware || 'desconocido').slice(0, 40);
    if (!existing) await persistDevices({ ...deviceState, devices: [...deviceState.devices, device] });
    return json(res, existing ? 200 : 201, { deviceId: device.deviceId, name: device.name, registered: true });
  }
  const deviceMatch = pathname.match(/^\/api\/devices\/([^/]+)\/(telemetry|heartbeat)$/);
  if (req.method === 'POST' && deviceMatch) {
    const device = deviceState.devices.find(item => item.deviceId === deviceMatch[1]);
    if (!device) return json(res, 404, { error: 'Dispositivo no registrado.' });
    if (!deviceAuth(req, device)) return json(res, 401, { error: 'Token de dispositivo inválido.' });
    const input = await body(req);
    if (input.weightKg != null && (!Number.isFinite(Number(input.weightKg)) || Number(input.weightKg) < 0)) return json(res, 400, { error: 'weightKg inválido.' });
    device.lastSeenAt = new Date().toISOString();
    device.latest = { weightKg: input.weightKg == null ? null : Number(input.weightKg), stable: Boolean(input.stable), calibrated: Boolean(input.calibrated), tared: Boolean(input.tared), button: Boolean(input.button), raw: input.raw ?? null, uptimeMs: input.uptimeMs ?? null, receivedAt: device.lastSeenAt };
    await persistDevices(deviceState);
    return json(res, 200, { accepted: true, serverTime: device.lastSeenAt });
  }
  if (req.method === 'GET' && pathname === '/api/products') return json(res, 200, products);
  if (req.method === 'GET' && pathname === '/api/formulas') return json(res, 200, products);
  const formulaMatch = pathname.match(/^\/api\/formulas\/([^/]+)$/);
  if (req.method === 'DELETE' && formulaMatch) {
    const code = decodeURIComponent(formulaMatch[1]).toUpperCase();
    if (!products.some(item => item.code === code)) return json(res, 404, { error: 'Fórmula inexistente.' });
    const next = products.filter(item => item.code !== code);
    await persistFormulas(next);
    return json(res, 200, { deleted: code });
  }
  if (req.method === 'POST' && pathname === '/api/formulas') {
    const formula = normalizeFormula(await body(req));
    const next = [...products.filter(item => item.code !== formula.code), formula].sort((a, b) => a.code.localeCompare(b.code));
    await persistFormulas(next);
    return json(res, 200, formula);
  }
  if (req.method === 'GET' && pathname === '/api/sessions') return json(res, 200, state.sessions.map(view));
  if (req.method === 'POST' && pathname === '/api/sessions') {
    const session = createSession(await body(req), state.nextId);
    await persist({ ...state, nextId: state.nextId + 1, sessions: [...state.sessions, session] });
    return json(res, 201, view(session));
  }
  const liveMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/live-weight$/);
  if (req.method === 'POST' && liveMatch) {
    const index = state.sessions.findIndex(s => s.id === liveMatch[1]);
    if (index < 0) return json(res, 404, { error: 'Formulación inexistente.' });
    const device = deviceState.devices.find(item => item.lastSeenAt && Date.now() - Date.parse(item.lastSeenAt) <= 15000 && item.latest?.weightKg != null);
    if (!device) return json(res, 409, { error: 'No hay una lectura reciente de la balanza.' });
    const session = structuredClone(state.sessions[index]);
    session.zeroOffsetKg = 0;
    action(session, 'simulate', { weightKg: device.latest.weightKg });
    const next = structuredClone(state); next.sessions[index] = session; await persist(next);
    return json(res, 200, view(session));
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
startLocalSerial();
