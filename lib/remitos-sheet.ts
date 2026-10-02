// Verified against '2026 Planilla Remitos' / 'Hoja 1', A1:T1.
export const REMITOS_SHEET_HEADERS = [
  "Fecha", "Cliente", "Proveedor", "Material", "Comprobante", "N° de Comprobante",
  "Unid", "Kg", "Mts", "Lts", "Precio Unitario", "Mes", "NOTAS", "EMPRESA", "OBRA",
  "COMPROBANTE RELAC.", "POLO", "IRIS SI - NO", "MATERIAL_STOCK", "AÑO",
] as const;

export type RemitosSheetRow = Record<(typeof REMITOS_SHEET_HEADERS)[number], string>;
export const REMITOS_AUTOMATIC_HEADERS = new Set<string>(["Fecha", "Mes", "AÑO"]);

export function uploadCalendar(timestamp: string) {
  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) => parts.find((entry) => entry.type === name)!.value;
  return {
    Fecha: `${part("day")}/${part("month")}/${part("year").slice(-2)}`,
    Mes: new Intl.DateTimeFormat("es-AR", { timeZone: "America/Buenos_Aires", month: "long" }).format(date),
    "AÑO": part("year"),
  };
}

const text = (value: unknown) => value == null ? "" : String(value).trim();

export function prepareRemitosSheetData(data: Record<string, unknown>, uploadedAt: string) {
  const calendar = uploadCalendar(uploadedAt);
  if (Array.isArray(data.rows)) {
    return { rows: data.rows.map((entry) => {
      const row = entry as Record<string, unknown>;
      return { ...Object.fromEntries(REMITOS_SHEET_HEADERS.map((header) => [header, text(row[header])])), ...calendar };
    }) };
  }
  const items = Array.isArray(data.items) && data.items.length ? data.items : [{}];
  return { rows: items.map((item: Record<string, unknown>) => ({
    Fecha: calendar.Fecha,
    Cliente: text(data.cliente),
    Proveedor: text(data.proveedor),
    Material: text(item.material),
    Comprobante: text(data.comprobante),
    "N° de Comprobante": text(data.comprobante_numero || (data.comprobante === "FACTURA" ? data.factura_numero : data.remito_aux || data.remito)),
    Unid: text(item.unidades), Kg: text(item.kg), Mts: text(item.mts), Lts: text(item.litros),
    "Precio Unitario": text(item.precio_unitario),
    Mes: calendar.Mes,
    NOTAS: text(item.NOTAS ?? data.NOTAS),
    EMPRESA: text(item.EMPRESA ?? data.EMPRESA),
    OBRA: text(item.OBRA ?? data.OBRA),
    "COMPROBANTE RELAC.": text(item["COMPROBANTE RELAC."] ?? data["COMPROBANTE RELAC."]),
    POLO: text(item.POLO ?? data.POLO),
    "IRIS SI - NO": text(item["IRIS SI - NO"] ?? data["IRIS SI - NO"]),
    MATERIAL_STOCK: text(item.MATERIAL_STOCK ?? data.MATERIAL_STOCK),
    "AÑO": calendar["AÑO"],
  })) };
}
