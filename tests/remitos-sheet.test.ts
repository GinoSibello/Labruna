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
      expect(row.Fecha).toBe("01/01/2000");
      expect(row.Mes).toBe("enero");
      expect(row["AÑO"]).toBe("2000");
    }
    expect(data.rows[0]).toMatchObject({ Material: "Chapa", Unid: "12", Kg: "864", NOTAS: "" });
    expect(data.rows[1]).toMatchObject({ Material: "Pintura", Lts: "20" });
  });

  it("uses the Buenos Aires upload day across month and year boundaries", () => {
    expect(uploadCalendar("2027-01-01T02:30:00Z")).toEqual({ Fecha: "31/12/26", Mes: "diciembre", "AÑO": "2026" });
  });

  it("preserves the reviewed date, derives month and year and strips unknown fields", () => {
    const data = prepareRemitosSheetData({ rows: [{
      Comprobante: "FACTURA", "N° de Comprobante": "789", NOTAS: "Revisado", EMPRESA: "Empresa",
      OBRA: "Obra", "COMPROBANTE RELAC.": "123", POLO: "Sí", "IRIS SI - NO": "NO", MATERIAL_STOCK: "Sí",
      Fecha: "02/09/25", Mes: "noviembre", "AÑO": "2027", extra: "No debe enviarse",
    }] }, "2026-10-01T15:00:00Z");
    const validated = validateModuleData("remitos", data);
    expect((validated.rows as Record<string, unknown>[])[0]).toMatchObject({ Fecha: "02/09/25", Mes: "septiembre", "AÑO": "2025", NOTAS: "Revisado", EMPRESA: "Empresa", OBRA: "Obra" });
    expect((validated.rows as Record<string, unknown>[])[0]).not.toHaveProperty("extra");
    expect(() => validateModuleData("remitos", { rows: [] })).toThrow();
  });

  it.each([undefined, null, "", "   "])("uses the upload day only when the model date is missing (%s)", (fecha) => {
    const uploadedAt = "2027-01-01T02:30:00Z";
    const expected = { Fecha: "31/12/26", Mes: "diciembre", "AÑO": "2026" };
    expect(prepareRemitosSheetData({ fecha }, uploadedAt).rows[0]).toMatchObject(expected);
    expect(prepareRemitosSheetData({ rows: [{ Fecha: fecha }] }, uploadedAt).rows[0]).toMatchObject(expected);
  });

  it("preserves ISO model dates and different dates per row through confirmation preparation", () => {
    const uploadedAt = "2026-10-01T15:00:00Z";
    const analyzed = prepareRemitosSheetData({ fecha: "2025-12-31" }, uploadedAt);
    expect(analyzed.rows[0]).toMatchObject({ Fecha: "2025-12-31", Mes: "diciembre", "AÑO": "2025" });
    expect(prepareRemitosSheetData(analyzed, uploadedAt)).toEqual(analyzed);
    const reviewed = prepareRemitosSheetData({ rows: [analyzed.rows[0], { Fecha: "1/2/2024" }] }, uploadedAt);
    expect(reviewed.rows[1]).toMatchObject({ Fecha: "1/2/2024", Mes: "febrero", "AÑO": "2024" });
  });

  it("keeps an unrecognized nonempty model date available for manual correction", () => {
    expect(prepareRemitosSheetData({ fecha: "ilegible" }, "2026-10-01T15:00:00Z").rows[0].Fecha).toBe("ilegible");
  });
});
