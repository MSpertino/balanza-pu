const $ = selector => document.querySelector(selector);
let editingCode = null;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}
function addMaterial(item = {}) {
  const row = document.createElement('div');
  row.className = 'material-row';
  row.innerHTML = `<label>Código<input data-field="material" required value="${escape(item.material || '')}" placeholder="MAT-ADITIVO"></label><label>Nombre<input data-field="name" required value="${escape(item.name || '')}" placeholder="Aditivo A"></label><label>Cantidad ref. (kg)<input data-field="referenceKg" type="number" min="0.000001" step="any" required value="${item.referenceKg ?? ''}"></label><label>Tolerancia (%)<input data-field="tolerancePct" type="number" min="0" max="100" step="0.1" required value="${item.tolerancePct ?? 2}"></label><button type="button" class="remove-material secondary" title="Quitar material">Quitar</button>`;
  row.querySelector('.remove-material').onclick = () => { if ($('#materials').children.length > 1) row.remove(); };
  $('#materials').append(row);
}
function readMaterials() {
  return [...document.querySelectorAll('.material-row')].map(row => Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, ['referenceKg', 'tolerancePct'].includes(input.dataset.field) ? Number(input.value) : input.value.trim()])));
}
function renderFormulaList(formulas) {
  $('#formula-list').innerHTML = formulas.map(formula => `<article class="formula-item"><div><strong>${escape(formula.code)} · ${escape(formula.name)}</strong><p class="muted">Referencia: ${formula.referencePolyolKg} kg de poliol · ${formula.formula.length} material${formula.formula.length === 1 ? '' : 'es'}</p></div><div>${formula.formula.map((item, index) => `<span class="formula-tag">${index + 1}. ${escape(item.name)} · ${item.referenceKg} kg · ±${item.tolerancePct}%</span>`).join('')}</div><div class="formula-actions"><button type="button" class="secondary edit-formula" data-code="${escape(formula.code)}">Editar</button><button type="button" class="secondary delete-formula" data-code="${escape(formula.code)}">Eliminar</button></div></article>`).join('') || '<p class="muted">Todavía no hay fórmulas.</p>';
  document.querySelectorAll('.edit-formula').forEach(button => button.onclick = () => editFormula(formulas.find(item => item.code === button.dataset.code)));
  document.querySelectorAll('.delete-formula').forEach(button => button.onclick = () => deleteFormula(button.dataset.code));
}
async function load() { renderFormulaList(await request('/api/formulas')); }
$('#add-material').onclick = () => addMaterial();
function editFormula(formula) {
  editingCode = formula.code; $('#code').value = formula.code; $('#code').disabled = true; $('#name').value = formula.name; $('#reference-polyol').value = formula.referencePolyolKg; $('#materials').replaceChildren(...[]); formula.formula.forEach(addMaterial); $('#cancel-edit').classList.remove('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function deleteFormula(code) {
  if (!confirm(`¿Eliminar la fórmula ${code}? Las formulaciones ya iniciadas conservarán su copia.`)) return;
  try { await request(`/api/formulas/${encodeURIComponent(code)}`, { method: 'DELETE' }); await load(); }
  catch (error) { $('#formula-error').textContent = error.message; }
}
function resetForm() { editingCode = null; $('#formula-form').reset(); $('#code').disabled = false; $('#reference-polyol').value = 190; $('#materials').replaceChildren(); addMaterial(); $('#cancel-edit').classList.add('hidden'); }
$('#cancel-edit').onclick = resetForm;
$('#formula-form').onsubmit = async event => {
  event.preventDefault(); $('#formula-error').textContent = '';
  try {
    await request('/api/formulas', { method: 'POST', body: JSON.stringify({ code: $('#code').value, name: $('#name').value, referencePolyolKg: Number($('#reference-polyol').value), formula: readMaterials() }) });
    resetForm(); await load();
  } catch (error) { $('#formula-error').textContent = error.message; }
};
addMaterial(); load().catch(error => { $('#formula-error').textContent = error.message; });
