// Shared by the n8n confirmation nodes and isolated integration tests.
export const sheetHeaders = {
  remitos: ['Fecha','Cliente','Proveedor','Material','Comprobante','N° de Comprobante','Unid','Kg','Mts','Lts','Precio Unitario','Mes','NOTAS','EMPRESA','OBRA','COMPROBANTE RELAC.','POLO','IRIS SI - NO','MATERIAL_STOCK','AÑO'],
  chapas: ['Fecha','N° POLO','N° CARMON','Diseñador del Plano','Cliente','Proyecto','Desarrollo: Total sum interna','Tamaño chapa','Espesor Chapa','Peso chapa (xm2)','Material','Cantidad total','Kg Totales','Observaciones - Anotaciones','Retira','Fecha','Precio x Kg en USD','Total en USD','ESTADO','Link Imagen'],
  cheques: ['FECHA DE ING.','MES','FECHA VTO.','Nº DE CHEQUE','CUIT/ CUIL','LIBRADOR','BANCO','CLIENTE / INGRESADO POR:','ESTADO DEL CHEQUE','ENTREGADO A: ','MONTO EN PESOS','OBSERVACIONES','EMPRESA','NOTAS','FECHA EMISION','FECHA DE PAGO DIFERIDO'],
};

export function validateConfirmation(body, module) {
  if (body.source !== 'web' || body.module !== module ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId ?? '') ||
      !String(body.userId ?? '').trim()) throw new Error('Solicitud web inválida');
  const data = typeof body.data === 'string' ? JSON.parse(body.data) : body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Datos inválidos');
  const rows = module === 'remitos' ? data.rows : [data];
  if (!Array.isArray(rows) || !rows.length || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Faltan filas revisadas');
  const keyColumn = module === 'remitos' ? 'N° de Comprobante' : module === 'chapas' ? 'N° POLO' : 'Nº DE CHEQUE';
  if (rows.some(row => !String(row[keyColumn] ?? '').trim())) throw new Error('Falta la clave del documento');
  if (module === 'remitos' && rows.some(row => !['REMITO','FACTURA'].includes(row.Comprobante))) throw new Error('Comprobante inválido');
  if (module === 'cheques' && !/^\d{8}$/.test(String(data[keyColumn]))) throw new Error('Número de cheque inválido');
  const rawKey = String(rows[0][keyColumn]).trim();
  const recordKey = module === 'remitos' ? rawKey.split('-').pop().trim().replace(/^0+(?=\d)/, '') : rawKey;
  return {requestId: body.requestId, module, recordKey, data, writesEnabled: true};
}

export function planSheetWrite(input, valuesResponse, metadataResponse, sheetId = 0) {
  const headers = sheetHeaders[input.module];
  const values = valuesResponse.values ?? [];
  if (!headers || headers.some((header, i) => values[0]?.[i] !== header) || values[0]?.length !== headers.length) throw new Error('Las columnas de Sheets cambiaron; revisar el formulario antes de guardar');
  const receiptKey = `labruna_web_${input.module}_${sheetId}`;
  const previous = (metadataResponse.developerMetadata ?? []).filter(entry => entry.metadataKey === receiptKey);
  const receipt = previous.find(entry => {
    try { return JSON.parse(entry.metadataValue).requestId === input.requestId; } catch { return false; }
  });
  if (receipt) {
    const saved = JSON.parse(receipt.metadataValue);
    if (saved.recordKey !== input.recordKey) throw new Error('La solicitud ya se guardó con otra clave');
    return {requests: [], result: {...saved, writesEnabled: true, message: 'Documento ya guardado; no se duplicó la confirmación.'}};
  }
  const rows = input.module === 'remitos' ? input.data.rows : [input.data];
  const keyIndex = input.module === 'remitos' ? 5 : input.module === 'chapas' ? 1 : 3;
  const matches = values.map((row, index) => ({row, index})).filter(({row,index}) => index > 0 && String(row[keyIndex] ?? '').trim() === input.recordKey);
  // Remitos retain the original append behavior: one row per reviewed article.
  // Chapas and cheques retain append-or-update by their existing business key.
  if (input.module !== 'remitos' && matches.length > 1) throw new Error('La clave aparece en varias filas; no se puede elegir una fila de forma segura');
  const numeric = new Set(['Unid','Kg','Mts','Lts','Precio Unitario','AÑO','Desarrollo: Total sum interna','Tamaño chapa','Espesor Chapa','Peso chapa (xm2)','Cantidad total','Kg Totales','Precio x Kg en USD','Total en USD','MONTO EN PESOS']);
  const cells = rows.map(row => ({values: headers.map((header,index) => {
    const key = input.module === 'chapas' && index === 15 ? 'column_P' : header;
    const value = row[key] == null ? '' : String(row[key]).trim();
    if (numeric.has(header) && /^-?\d+(?:[.,]\d+)?$/.test(value)) return {userEnteredValue: {numberValue: Number(value.replace(',', '.'))}};
    return {userEnteredValue: {stringValue: value}};
  })}));
  const update = input.module !== 'remitos' && matches.length === 1;
  const write = update ? {updateCells: {range: {sheetId, startRowIndex: matches[0].index, endRowIndex: matches[0].index + 1, startColumnIndex: 0, endColumnIndex: headers.length}, rows: cells, fields: 'userEnteredValue'}} : {appendCells: {sheetId, rows: cells, fields: 'userEnteredValue'}};
  const result = {requestId: input.requestId, recordKey: input.recordKey, operation: update ? 'updated' : 'created', writesEnabled: true, message: 'Documento guardado en Google Sheets.'};
  // Explicit metadata IDs are unique in a spreadsheet. Concurrent retries choose
  // the same ID, so Sheets rejects the second entire atomic batch, including its
  // append. A later retry finds the receipt. Resolve unrelated hash collisions
  // against all existing metadata IDs before constructing the batch.
  let hash = 2166136261;
  for (const char of `${receiptKey}:${input.requestId}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  let metadataId = (hash & 0x7fffffff) || 1;
  const usedIds = new Set((metadataResponse.developerMetadata ?? []).map(entry => entry.metadataId));
  while (usedIds.has(metadataId)) metadataId = metadataId === 0x7fffffff ? 1 : metadataId + 1;
  return {requests: [write, {createDeveloperMetadata: {developerMetadata: {metadataId, metadataKey: receiptKey, metadataValue: JSON.stringify({requestId: input.requestId, recordKey: input.recordKey, operation: result.operation}), location: {spreadsheet: true}, visibility: 'DOCUMENT'}}}], result};
}
