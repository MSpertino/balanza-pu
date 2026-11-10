// Recetas ilustrativas: reemplazar por valores aprobados en planta.
export const products = [
  { code: 'SAP-001', name: 'PU demostración A', referencePolyolKg: 190, formula: [
    { material: 'MAT-AGUA', name: 'Agua', referenceKg: 2.5, tolerancePct: 2 },
    { material: 'MAT-ADITIVO', name: 'Aditivo A', referenceKg: 0.5, tolerancePct: 4 }
  ] },
  { code: 'SAP-002', name: 'PU demostración B', referencePolyolKg: 190, formula: [
    { material: 'MAT-AGUA', name: 'Agua', referenceKg: 1.5, tolerancePct: 2 },
    { material: 'MAT-ADITIVO', name: 'Aditivo B', referenceKg: 0.5, tolerancePct: 3 }
  ] }
];
const check = (ok, message) => { if (!ok) throw new Error(message); };
export function createSession(input, id) {
  const recipe = products.find(p => p.code === input.productCode);
  check(recipe, 'Producto SAP inexistente.');
  check(typeof input.polyolKg === 'number' && Number.isFinite(input.polyolKg) && input.polyolKg > 0 && input.polyolKg <= 1000000, 'Ingresá los kg reales de poliol.');
  check(input.polyolValidated === true && input.isocyanateValidated === true, 'Confirmá la validación de poliol e isocianato, dosificados aparte.');
  return { id: `FORM-${String(id).padStart(5, '0')}`, productCode: recipe.code, productName: recipe.name,
    recipe: structuredClone(recipe), operator: String(input.operator || 'Operador demo'), status: 'INICIADA',
    startedAt: new Date().toISOString(), polyolKg: input.polyolKg,
    validations: ['POLIOL', 'ISOCIANATO'].map(material => ({ material, confirmed: true, at: new Date().toISOString() })),
    simulatedWeightKg: 0, zeroOffsetKg: 0, entries: [], audit: [] };
}
export function view(s) {
  const entries = s.entries.filter(e => !e.voidedAt);
  const steps = s.recipe.formula.map(item => ({ ...item, targetKg: s.polyolKg * item.referenceKg / s.recipe.referencePolyolKg }));
  const currentStep = steps[entries.length] || null;
  const currentWeightKg = s.simulatedWeightKg - s.zeroOffsetKg;
  let signal = 'COMPLETO', message = 'Todos los materiales están registrados.';
  let minKg = null, maxKg = null;
  if (currentStep) {
    minKg = currentStep.targetKg * (1 - currentStep.tolerancePct / 100);
    maxKg = currentStep.targetKg * (1 + currentStep.tolerancePct / 100);
    const epsilon = Number.EPSILON * Math.max(1, Math.abs(s.simulatedWeightKg), Math.abs(maxKg)) * 8;
    signal = currentWeightKg > maxKg + epsilon ? 'ROJO' : currentWeightKg < minKg - epsilon || currentWeightKg <= 0 ? 'AMARILLO' : 'VERDE';
    message = signal === 'ROJO' ? 'Exceso de peso. Retirá material o reiniciá este aditivo.' : signal === 'AMARILLO' ? 'Falta material para alcanzar la tolerancia.' : 'Peso dentro de tolerancia. Podés confirmar.';
  }
  return { ...s, currentWeightKg, steps, currentStep, minKg, maxKg, signal, message,
    canRecord: s.status === 'INICIADA' && !!currentStep && signal === 'VERDE',
    canFinish: s.status === 'INICIADA' && !currentStep, canReset: s.status === 'INICIADA',
    canZero: s.status === 'INICIADA' && s.entries.length === 0 && signal !== 'ROJO' };
}
export function action(s, type, input = {}) {
  check(s.status === 'INICIADA', 'La formulación ya está finalizada.');
  const before = view(s), at = new Date().toISOString();
  if (type === 'simulate') {
    check(typeof input.weightKg === 'number' && Number.isFinite(input.weightKg) && input.weightKg >= 0 && input.weightKg <= 1000000, 'Ingresá una lectura válida entre 0 y 1000000 kg.');
    s.simulatedWeightKg = input.weightKg;
  } else if (type === 'zero') {
    check(before.canZero, 'Tara bloqueada. En rojo debés retirar el exceso; para corregir usá reiniciar aditivo.');
    s.zeroOffsetKg = s.simulatedWeightKg;
  } else if (type === 'record') {
    check(input.expectedMaterial === before.currentStep?.material, 'El paso cambió. Actualizá la pantalla antes de confirmar.');
    check(before.canRecord, before.currentStep ? 'Peso fuera de tolerancia: no se puede confirmar.' : 'Todos los materiales ya fueron registrados.');
    s.entries.push({ id: `P-${s.entries.length + 1}`, material: before.currentStep.material, name: before.currentStep.name,
      weightKg: before.currentWeightKg, targetKg: before.currentStep.targetKg, tolerancePct: before.currentStep.tolerancePct,
      recordedAt: at, scaleKg: s.simulatedWeightKg, tareBeforeKg: s.zeroOffsetKg });
    s.zeroOffsetKg = s.simulatedWeightKg;
  } else if (type === 'reset') {
    const last = s.entries.filter(e => !e.voidedAt).at(-1);
    if (input.material === before.currentStep?.material && before.currentStep.material !== 'POLIOL') {
      check(Math.abs(before.currentWeightKg) <= 0.000001, 'Retirá el material del aditivo actual hasta volver a 0 kg antes de reiniciarlo.');
    } else {
      check(last && last.material !== 'POLIOL' && input.material === last.material, 'Solo se puede reiniciar el aditivo actual o el último confirmado.');
      check(Math.abs(s.simulatedWeightKg - last.tareBeforeKg) <= 0.000001, 'Retirá el último aditivo y cualquier carga pendiente hasta recuperar la lectura anterior.');
      last.voidedAt = at;
      s.zeroOffsetKg = last.tareBeforeKg;
    }
  } else if (type === 'finish') {
    check(before.canFinish, 'Registrá el poliol y todos los aditivos antes de finalizar.');
    check(Math.abs(before.currentWeightKg) <= 0.000001, 'Hay material sin registrar sobre la balanza.');
    s.status = 'FINALIZADA'; s.finishedAt = at;
  } else throw new Error('Acción inválida.');
  s.audit.push({ action: type, at, input, scaleKg: s.simulatedWeightKg, zeroOffsetKg: s.zeroOffsetKg });
}
