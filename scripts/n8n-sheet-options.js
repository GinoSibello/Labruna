// Pure planner used inside the n8n Code node. It changes validation only.
export function planOptions(spreadsheet, input) {
  const columns = { 7: 'CLIENTE / INGRESADO POR:', 8: 'ESTADO DEL CHEQUE', 12: 'EMPRESA' };
  const options = Object.fromEntries(Object.values(columns).map(field => [field, []]));
  const requests = [];
  const segments = [];
  for (const sheet of spreadsheet.sheets ?? []) {
    if (sheet.properties.sheetId !== 0 || sheet.properties.title !== 'Hoja 1') continue;
    for (const grid of sheet.data ?? []) {
      for (const [rowIndex, row] of (grid.rowData ?? []).entries()) {
        for (const [columnIndex, cell] of (row.values ?? []).entries()) {
          const column = columnIndex + (grid.startColumn ?? 0);
          const field = columns[column];
          const rule = cell.dataValidation;
          if (!field || !rule) continue;
          if (rule.condition?.type !== 'ONE_OF_LIST') throw new Error('La validación de la planilla cambió; revisar antes de agregar opciones');
          for (const value of rule.condition.values ?? []) {
            const text = value.userEnteredValue;
            if (typeof text === 'string' && !options[field].includes(text)) options[field].push(text);
          }
          if (input.action !== 'add' || input.field !== field || rule.condition.values.some(v => v.userEnteredValue === input.value)) continue;
          const updated = { ...rule, condition: { ...rule.condition, values: [...rule.condition.values, { userEnteredValue: input.value }] } };
          const index = rowIndex + (grid.startRow ?? 0);
          const previous = segments.at(-1);
          if (previous && previous.column === column && previous.end === index && JSON.stringify(previous.rule) === JSON.stringify(updated)) previous.end++;
          else segments.push({ column, start: index, end: index + 1, rule: updated });
        }
      }
    }
  }
  for (const field of Object.values(columns)) if (!options[field].length) throw new Error('No se encontró la lista esperada en Google Sheets');
  for (const segment of segments) requests.push({ setDataValidation: {
    range: { sheetId: 0, startRowIndex: segment.start, endRowIndex: segment.end, startColumnIndex: segment.column, endColumnIndex: segment.column + 1 }, rule: segment.rule,
  } });
  // On a read, do not append anything; after an add the workflow re-reads Google.
  return { options, requests };
}
