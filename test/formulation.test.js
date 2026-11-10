import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, view, action } from '../src/formulation.js';
const input = { productCode: 'SAP-001', polyolKg: 190, polyolValidated: true, isocyanateValidated: true };
const fresh = () => createSession(input, 1);
const weigh = (s, weightKg) => action(s, 'simulate', { weightKg });
const record = s => action(s, 'record', { expectedMaterial: view(s).currentStep?.material });

test('polioI manual, validaciones y proporción sin redondear', () => {
  assert.throws(() => createSession({ ...input, polyolKg: 0 }, 1));
  assert.throws(() => createSession({ ...input, isocyanateValidated: false }, 1));
  const s = createSession({ ...input, polyolKg: 142 }, 1);
  assert.equal(view(s).currentStep.targetKg, 142 * 2.5 / 190);
  assert.equal(s.validations.length, 2);
});
test('amarillo y rojo bloquean OK; rojo bloquea tara; límites inclusivos', () => {
  const s = fresh();
  assert.equal(view(s).signal, 'AMARILLO'); assert.throws(() => record(s));
  weigh(s, 9.9); assert.equal(view(s).signal, 'ROJO');
  assert.throws(() => record(s)); assert.throws(() => action(s, 'zero'));
  for (const weight of [2.45, 2.55]) { weigh(s, weight); assert.equal(view(s).canRecord, true); }
  weigh(s, 2.449); assert.equal(view(s).signal, 'AMARILLO');
  weigh(s, 2.551); assert.equal(view(s).signal, 'ROJO');
});
test('OK tara y evita confirmación duplicada; finalización bloquea cambios', () => {
  const s = fresh(); assert.throws(() => action(s, 'finish'));
  weigh(s, 2.5); record(s); assert.equal(view(s).currentWeightKg, 0);
  assert.throws(() => action(s, 'record', { expectedMaterial: 'MAT-AGUA' }));
  assert.throws(() => action(s, 'zero'));
  weigh(s, 3); record(s); action(s, 'finish');
  assert.equal(s.status, 'FINALIZADA'); assert.throws(() => weigh(s, 4));
});
test('reinicio conserva otros aditivos e historial y requiere retiro físico', () => {
  const s = fresh(); weigh(s, 2.5); record(s); weigh(s, 3.5);
  assert.throws(() => action(s, 'reset', { material: 'MAT-ADITIVO' }));
  weigh(s, 2.5); action(s, 'reset', { material: 'MAT-ADITIVO' });
  assert.equal(s.entries.length, 1);
  weigh(s, 3); record(s);
  assert.throws(() => action(s, 'reset', { material: 'MAT-ADITIVO' }));
  weigh(s, 2.5); action(s, 'reset', { material: 'MAT-ADITIVO' });
  assert.ok(s.entries[1].voidedAt); assert.equal(view(s).currentStep.material, 'MAT-ADITIVO');
  weigh(s, 3); record(s); assert.equal(s.entries.length, 3);
  assert.equal(s.entries[0].voidedAt, undefined);
});
test('rechaza pesos inválidos y carga pendiente al cerrar', () => {
  const s = fresh(); for (const weight of [-1, NaN, Infinity, '', null]) assert.throws(() => weigh(s, weight));
  weigh(s, 2.5); record(s); weigh(s, 3); record(s); weigh(s, 3.1);
  assert.throws(() => action(s, 'finish'));
});
