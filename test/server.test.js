import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('API bloquea exceso, conserva datos al reiniciar y serializa creaciones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'balanza-test-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATA_FILE: join(dir, 'sessions.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
    return await new Promise((resolve, reject) => {
      let out = '', errors = '';
      const timer = setTimeout(() => reject(new Error('Timeout de inicio: ' + errors)), 10000);
      child.stderr.on('data', c => { errors += c; });
      child.stdout.on('data', c => { out += c; const match = out.match(/http:\/\/127.0.0.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Servidor terminó ${code}: ${errors}`)); });
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill(); await exited; child = null; }
  try {
    let url = await start();
    const post = (path, data) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const input = { productCode: 'SAP-001', polyolKg: 190, polyolValidated: true, isocyanateValidated: true };
    const sessions = await Promise.all([post('/api/sessions', input), post('/api/sessions', input)]).then(rs => Promise.all(rs.map(r => r.json())));
    assert.notEqual(sessions[0].id, sessions[1].id);
    const path = '/api/sessions/' + sessions[0].id;
    await post(path + '/simulate', { weightKg: 9.9 });
    assert.equal((await post(path + '/record', { expectedMaterial: 'MAT-AGUA' })).status, 400);
    assert.equal((await post(path + '/zero', {})).status, 400);
    assert.equal((await post(path + '/finish', {})).status, 400);
    await post(path + '/simulate', { weightKg: 2.5 });
    assert.equal((await post(path + '/record', { expectedMaterial: 'MAT-AGUA' })).status, 200);
    assert.equal((await fetch(url + '/')).status, 200);
    assert.equal((await fetch(url + '/missing')).status, 404);
    await stop(); url = await start();
    const recovered = await fetch(url + path).then(r => r.json());
    assert.equal(recovered.entries[0].weightKg, 2.5); assert.equal(recovered.currentWeightKg, 0);
    assert.equal(recovered.validations.length, 2);
    const csv = await fetch(url + '/api/export.csv').then(r => r.text()); assert.ok(csv.includes('MAT-AGUA'));
    const stored = JSON.parse(await readFile(join(dir, 'sessions.json'), 'utf8')); assert.equal(stored.sessions.length, 2);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
