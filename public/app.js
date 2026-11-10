const $ = selector => document.querySelector(selector);
let session = null, busy = false;
const kg = value => value == null ? '—' : Number(value).toLocaleString('es-AR', { maximumFractionDigits: 6 });
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
async function request(url, options = {}) {
  let response;
  try { response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options }); }
  catch { throw new Error('Sin conexión con el servidor. No se registraron cambios. Volvé a conectar y actualizá.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}
function render() {
  $('#start-card').classList.toggle('hidden', !!session);
  $('#work-card').classList.toggle('hidden', !session);
  if (!session) return;
  const s = session;
  $('#weight').textContent = kg(s.currentWeightKg);
  $('#gross').textContent = `Lectura total: ${kg(s.simulatedWeightKg)} kg · Tara: ${kg(s.zeroOffsetKg)} kg`;
  $('#product-name').textContent = s.productName;
  $('#session-id').textContent = `${s.id} · ${s.operator}`;
  $('#status').textContent = s.status;
  $('#step').textContent = s.currentStep ? `Pesar: ${s.currentStep.name}` : 'Pesaje completo';
  $('#target').textContent = s.currentStep?.targetKg != null ? `Objetivo: ${kg(s.currentStep.targetKg)} kg · ±${s.currentStep.tolerancePct}% · Rango: ${kg(s.minKg)} a ${kg(s.maxKg)} kg` : 'El peso real del poliol define los objetivos de los aditivos.';
  $('#signal').className = `signal ${s.signal.toLowerCase()}`;
  $('#signal').textContent = `${s.signal} · ${s.message}`;
  $('#record').disabled = busy || !s.canRecord;
  $('#finish').disabled = busy || !s.canFinish;
  $('#zero').disabled = busy || !s.canZero;
  $('#apply-weight').disabled = busy || s.status !== 'INICIADA';
  $('#reset').disabled = busy || !s.canReset || !s.currentStep || s.currentStep.material === 'POLIOL';
  const last = s.entries.filter(e => !e.voidedAt).at(-1);
  $('#undo').disabled = busy || s.status !== 'INICIADA' || !last || last.material === 'POLIOL';
  $('#recipe').innerHTML = s.steps.map(step => `<div class="entry"><span>${escape(step.name)}</span><span>${step.targetKg == null ? 'Peso libre' : `${kg(step.targetKg)} kg · ±${step.tolerancePct}%`}</span></div>`).join('');
  $('#entries').innerHTML = s.entries.length ? s.entries.map(e => `<div class="entry ${e.voidedAt ? 'voided' : ''}"><span>${escape(e.name)}${e.voidedAt ? ' · ANULADO' : ''}</span><strong>${kg(e.weightKg)} kg</strong></div>`).join('') : '<p class="muted">Todavía no hay pesadas registradas.</p>';
}
async function run(task, errorId = '#work-error') {
  if (busy) return;
  busy = true; $(errorId).textContent = ''; render();
  try { await task(); }
  catch (error) { $(errorId).textContent = error.message; }
  finally { busy = false; render(); }
}
async function act(action, payload = {}) {
  session = await request(`/api/sessions/${session.id}/${action}`, { method: 'POST', body: JSON.stringify(payload) });
}
document.querySelectorAll('[data-polyol]').forEach(button => button.onclick = () => { $('#polyol').value = button.dataset.polyol; });
$('#start').onclick = () => run(async () => {
  session = await request('/api/sessions', { method: 'POST', body: JSON.stringify({ productCode: $('#product').value.trim().toUpperCase(), operator: $('#operator').value.trim(), polyolKg: Number($('#polyol').value), polyolValidated: $('#polyol-valid').checked, isocyanateValidated: $('#iso-valid').checked }) });
  localStorage.setItem('balanza-session', session.id);
  $('#simulated').value = session.simulatedWeightKg;
}, '#start-error');
$('#apply-weight').onclick = () => run(async () => {
  if ($('#simulated').value.trim() === '') throw new Error('Ingresá una lectura.');
  await act('simulate', { weightKg: Number($('#simulated').value) });
});
$('#zero').onclick = () => run(() => act('zero'));
$('#record').onclick = () => run(() => act('record', { expectedMaterial: session.currentStep?.material }));
$('#reset').onclick = () => run(() => act('reset', { material: session.currentStep?.material }));
$('#undo').onclick = () => run(() => act('reset', { material: session.entries.filter(e => !e.voidedAt).at(-1)?.material }));
$('#finish').onclick = () => run(() => act('finish'));
$('#refresh').onclick = () => run(async () => { session = await request(`/api/sessions/${session.id}`); $('#simulated').value = session.simulatedWeightKg; });
$('#new').onclick = () => { if (busy) return; session = null; localStorage.removeItem('balanza-session'); render(); loadSessions(); };
async function resume(id) {
  session = await request(`/api/sessions/${encodeURIComponent(id)}`);
  localStorage.setItem('balanza-session', session.id);
  $('#simulated').value = session.simulatedWeightKg;
}
async function loadSessions() {
  try {
    const sessions = await request('/api/sessions');
    $('#sessions').replaceChildren(...sessions.slice().reverse().map(s => {
      const button = document.createElement('button'); button.className = 'chip';
      button.textContent = `${s.id} · ${s.productName} · ${s.status}`;
      button.onclick = () => run(() => resume(s.id), '#start-error'); return button;
    }));
  } catch (error) { $('#start-error').textContent = error.message; }
}
run(async () => {
  const products = await request('/api/products');
  $('#products').replaceChildren(...products.map(p => {
    const button = document.createElement('button'); button.className = 'chip'; button.textContent = `${p.code} · ${p.name}`;
    button.onclick = () => { $('#product').value = p.code; }; return button;
  }));
  await loadSessions();
  const saved = localStorage.getItem('balanza-session');
  if (saved) await resume(saved);
}, '#start-error');
