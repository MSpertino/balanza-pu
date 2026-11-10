const $ = selector => document.querySelector(selector);
let products = [], session = null;
let offlineMode = false;
const demoProducts = [
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

async function request(url, options = {}) {
  try { const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Error inesperado'); return data; }
  catch (error) { if (error instanceof TypeError || error.message === 'Failed to fetch') { offlineMode = true; throw new Error('MODO DEMO'); } throw error; }
}
function product() { return products.find(item => item.code === $('#product').value.trim().toUpperCase()); }
function renderProducts() { $('#products').innerHTML = products.map(item => `<button class="chip" data-code="${item.code}">${item.code} · ${item.name}</button>`).join(''); document.querySelectorAll('.chip').forEach(button => button.onclick = () => { $('#product').value = button.dataset.code; }); }
function render() {
  if (!session) return;
  $('#weight').textContent = session.currentWeightKg.toFixed(3); $('#product-name').textContent = session.productName; $('#session-id').textContent = `${session.id} · Operador demo`; $('#status').textContent = session.status;
  $('#entries').innerHTML = session.entries.length ? session.entries.map((entry, index) => `<div class="entry"><span>${index + 1}. <b>${entry.material}</b></span><strong>${entry.weightKg.toFixed(3)} kg</strong></div>`).join('') : '<p class="muted">Todavía no hay materiales registrados.</p>';
}
async function act(action, payload = {}) {
  if (!offlineMode) { try { session = await request(`/api/sessions/${session.id}/${action}`, { method: 'POST', body: JSON.stringify(payload) }); render(); return; } catch (error) { if (error.message !== 'MODO DEMO') throw error; } }
  if (action === 'simulate') session.simulatedWeightKg = Number(payload.weightKg) || 0;
  if (action === 'zero') { session.zeroOffsetKg = session.simulatedWeightKg; session.lastRecordedScaleKg = session.simulatedWeightKg; }
  if (action === 'record') { const weightKg = Number((session.simulatedWeightKg - session.lastRecordedScaleKg).toFixed(3)); if (weightKg <= 0) throw new Error('El peso debe ser mayor que cero.'); session.entries.push({ id: `P-${session.entries.length + 1}`, material: payload.material, weightKg, recordedAt: new Date().toISOString() }); session.lastRecordedScaleKg = session.simulatedWeightKg; }
  if (action === 'finish') session.status = 'FINALIZADA';
  session.currentWeightKg = Math.max(0, session.simulatedWeightKg - session.zeroOffsetKg); render();
}

$('#start').onclick = async () => { try { const p = product(); if (!p) throw new Error('Ingresá un código SAP válido.'); try { session = await request('/api/sessions', { method: 'POST', body: JSON.stringify({ productCode: p.code }) }); } catch (error) { if (error.message !== 'MODO DEMO') throw error; session = { id: 'DEMO-LOCAL', productCode: p.code, productName: p.name, operator: 'Operador demo', status: 'MODO DEMO', zeroOffsetKg: 0, simulatedWeightKg: 0, currentWeightKg: 0, lastRecordedScaleKg: 0, entries: [] }; } $('#start-card').classList.add('hidden'); $('#work-card').classList.remove('hidden'); render(); } catch (error) { $('#start-error').textContent = error.message; } };
$('#apply-weight').onclick = () => act('simulate', { weightKg: $('#simulated').value });
$('#zero').onclick = () => act('zero');
$('#record').onclick = async () => { try { const p = products.find(item => item.code === session.productCode); const next = p.formula[session.entries.length]; if (!next) throw new Error('Todos los materiales previstos ya fueron registrados.'); await act('record', { material: next.name }); } catch (error) { $('#work-error').textContent = error.message; } };
$('#finish').onclick = () => act('finish');
$('#new').onclick = () => location.reload();
request('/api/products').then(data => { products = data; renderProducts(); }).catch(error => { if (error.message === 'MODO DEMO') { products = demoProducts; renderProducts(); $('#start-error').textContent = 'Servidor desconectado: estás usando MODO DEMO local.'; } else { $('#start-error').textContent = error.message; } });
