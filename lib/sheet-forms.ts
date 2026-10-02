import { uploadCalendar } from "@/lib/remitos-sheet";

// Verified from the live Sheets header rows. column_P preserves the second Fecha.
export const CHAPAS_COLUMNS = [
  "Fecha", "N° POLO", "N° CARMON", "Diseñador del Plano", "Cliente", "Proyecto",
  "Desarrollo: Total sum interna", "Tamaño chapa", "Espesor Chapa", "Peso chapa (xm2)",
  "Material", "Cantidad total", "Kg Totales", "Observaciones - Anotaciones", "Retira",
  "Fecha", "Precio x Kg en USD", "Total en USD", "ESTADO", "Link Imagen",
].map((label, index) => ({ key: index === 15 ? "column_P" : label, label, automatic: index === 0 }));
export const CHEQUES_COLUMNS = [
  "FECHA DE ING.", "MES", "FECHA VTO.", "Nº DE CHEQUE", "CUIT/ CUIL", "LIBRADOR", "BANCO",
  "CLIENTE / INGRESADO POR:", "ESTADO DEL CHEQUE", "ENTREGADO A: ", "MONTO EN PESOS",
  "OBSERVACIONES", "EMPRESA", "NOTAS", "FECHA EMISION", "FECHA DE PAGO DIFERIDO",
].map((label, index) => ({ key: label, label, automatic: index < 2 }));
export const CHEQUE_DROPDOWNS = ["CLIENTE / INGRESADO POR:", "ESTADO DEL CHEQUE", "EMPRESA"];

const asText = (value: unknown) => value == null ? "" : String(value).trim();
export function prepareSheetFormData(module: "chapas" | "cheques", data: Record<string, unknown>, uploadedAt: string) {
  const columns = module === "chapas" ? CHAPAS_COLUMNS : CHEQUES_COLUMNS;
  const aliases: Record<string, string[]> = module === "chapas" ? {
    "N° POLO": ["N_POLO"], "Diseñador del Plano": ["arquitecto"], Cliente: ["cliente"], Proyecto: ["proyecto"],
    "Desarrollo: Total sum interna": ["desarrollo_a", "total_suma_interna_mm", "desarrollo"],
    "Tamaño chapa": ["desarrollo_b"], "Espesor Chapa": ["espesor_material_mm"],
    "Peso chapa (xm2)": ["kg_m2"], Material: ["color_material", "material"], "Cantidad total": ["cantidad_total"],
  } : {
    "Nº DE CHEQUE": ["numero_cheque"], "CUIT/ CUIL": ["librador_cuit"], LIBRADOR: ["librador_nombre"], BANCO: ["banco"],
    "MONTO EN PESOS": ["monto_numeros"], "FECHA VTO.": ["fecha_vencimiento", "fecha_pago_diferido"],
    "FECHA EMISION": ["fecha_emision"], "FECHA DE PAGO DIFERIDO": ["fecha_pago_diferido"],
  };
  const result: Record<string, string> = {};
  for (const column of columns) {
    const value = data[column.key] ?? aliases[column.key]?.map((key) => data[key]).find((entry) => entry != null);
    result[column.key] = asText(value);
  }
  const calendar = uploadCalendar(uploadedAt);
  if (module === "chapas") result.Fecha = calendar.Fecha;
  else {
    result["FECHA DE ING."] = calendar.Fecha.slice(0, 6) + calendar["AÑO"];
    result.MES = calendar.Mes;
  }
  return result;
}
