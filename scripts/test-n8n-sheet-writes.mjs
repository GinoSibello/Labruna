import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sheetHeaders, validateConfirmation, planSheetWrite} from './n8n-sheet-writes.js';
const requestId = 'fa3249d4-e205-46c5-9a70-01a12d45fc70';
function sample(module) {
  const row = Object.fromEntries(sheetHeaders[module].map((h, i) => [module === 'chapas' && i === 15 ? 'column_P' : h, `reviewed-${i}`]));
  if (module === 'remitos') { row.Comprobante = 'FACTURA'; row['N° de Comprobante'] = '000123'; }
  if (module === 'chapas') row['N° POLO'] = 'WEB-TEST';
  if (module === 'cheques') { row['Nº DE CHEQUE'] = '00123456'; row['MONTO EN PESOS'] = '123.45'; }
  return {module, source: 'web', userId: 'isolated-test', requestId, data: JSON.stringify(module === 'remitos' ? {rows: [row, {...row, Material: 'second item'}]} : row)};
}
for (const module of Object.keys(sheetHeaders)) {
  test(`${module}: exact reviewed columns and atomic receipt`, () => {
    const input = validateConfirmation(sample(module), module);
    const plan = planSheetWrite(input, {values: [sheetHeaders[module]]}, {});
    assert.equal(input.writesEnabled, true);
    assert.equal(plan.requests.length, 2);
    const rows = plan.requests[0].appendCells.rows;
    assert.equal(rows.length, module === 'remitos' ? 2 : 1);
    assert.equal(rows[0].values.length, sheetHeaders[module].length);
    if (module === 'chapas') {
      assert.equal(rows[0].values[0].userEnteredValue.stringValue, 'reviewed-0');
      assert.equal(rows[0].values[15].userEnteredValue.stringValue, 'reviewed-15');
    }
    if (module === 'cheques') {
      assert.equal(rows[0].values[3].userEnteredValue.stringValue, '00123456');
      assert.equal(rows[0].values[10].userEnteredValue.numberValue, 123.45);
    }
    const replay = planSheetWrite(input, {values: [sheetHeaders[module]]}, {developerMetadata: [plan.requests[1].createDeveloperMetadata.developerMetadata]});
    assert.deepEqual(replay.requests, []);
    assert.equal(replay.result.operation, 'created');
  });
  test(`${module}: rejects changed headers before writes`, () => {
    assert.throws(() => planSheetWrite(validateConfirmation(sample(module), module), {values: [['wrong column']]}, {}));
  });
  if (module !== 'remitos') test(`${module}: update existing row, reject ambiguous key`, () => {
    const input = validateConfirmation(sample(module), module);
    const row = sheetHeaders[module].map(h => h === (module === 'chapas' ? 'N° POLO' : 'Nº DE CHEQUE') ? input.recordKey : 'old');
    const plan = planSheetWrite(input, {values: [sheetHeaders[module], row]}, {});
    assert.equal(plan.result.operation, 'updated');
    assert.equal(plan.requests[0].updateCells.range.startRowIndex, 1);
    assert.throws(() => planSheetWrite(input, {values: [sheetHeaders[module], row, row]}, {}));
  });
}
test('malformed and wrong-module confirmations cannot write', () => {
  assert.throws(() => validateConfirmation({...sample('cheques'), requestId: 'bad'}, 'cheques'));
  assert.throws(() => validateConfirmation(sample('cheques'), 'remitos'));
});
