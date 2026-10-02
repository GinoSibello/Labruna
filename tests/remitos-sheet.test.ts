import { describe, expect, it } from "vitest";
import { REMITOS_SHEET_HEADERS, prepareRemitosSheetData, uploadCalendar } from "@/lib/remitos-sheet";
import { validateModuleData } from "@/lib/modules";

describe("Remitos sheet review", () => {
  it("maps each article to exactly the twenty live sheet headers", () => {
    const data = prepareRemitosSheetData({
      comprobante: "REMITO", comprobante_numero: "123", proveedor: "Proveedor",
      fecha: "01/01/2000", destino: "No es una columna", transporte_numero: "T-1",
      items: [{ material: "Chapa", unidades: 12, kg: 864, lote: "L-1", moneda: "ARS" }, { material: "Pintura", litros: 20 }],
    }, "2026-10-01T15:00:00Z");
    expect(data.rows).toHaveLength(2);
    for (const row of data.rows) {
      expect(Object.keys(row)).toEqual([...REMITOS_SHEET_HEADERS]);
      expect(row.Fecha).toBe("01/10/26");
      expect(row.Mes).toBe("octubre");
      expect(row["AÑO"]).toBe("2026");
    }
    expect(data.rows[0]).toMatchObject({ Material: "Chapa", Unid: "12", Kg: "864", NOTAS: "" });
    expect(data.rows[1]).toMatchObject({ Material: "Pintura", Lts: "20" });
  });

  it("uses the Buenos Aires upload day across month and year boundaries", () => {
    expect(uploadCalendar("2027-01-01T02:30:00Z")).toEqual({ Fecha: "31/12/26", Mes: "diciembre", "AÑO": "2026" });
  });

  it("preserves edits in every sheet column, strips unknown fields and restores the upload date", () => {
    const data = prepareRemitosSheetData({ rows: [{
      Comprobante: "FACTURA", "N° de Comprobante": "789", NOTAS: "Revisado", EMPRESA: "Empresa",
      OBRA: "Obra", "COMPROBANTE RELAC.": "123", POLO: "Sí", "IRIS SI - NO": "NO", MATERIAL_STOCK: "Sí",
      Fecha: "02/10/26", Mes: "noviembre", "AÑO": "2027", extra: "No debe enviarse",
    }] }, "2026-10-01T15:00:00Z");
    const validated = validateModuleData("remitos", data);
    expect((validated.rows as Record<string, unknown>[])[0]).toMatchObject({ Fecha: "01/10/26", Mes: "octubre", "AÑO": "2026", NOTAS: "Revisado", EMPRESA: "Empresa", OBRA: "Obra" });
    expect((validated.rows as Record<string, unknown>[])[0]).not.toHaveProperty("extra");
    expect(() => validateModuleData("remitos", { rows: [] })).toThrow();
  });
});
