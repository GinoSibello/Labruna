import { describe, expect, it } from "vitest";
import { normalizeBusinessKey, validateModuleData } from "@/lib/modules";
import { prepareSheetFormData } from "@/lib/sheet-forms";
import { prepareRemitosSheetData } from "@/lib/remitos-sheet";

describe("module validation", () => {
  it("accepts an invoice without a remito and preserves classification and prices", () => {
    const data = validateModuleData("remitos", prepareRemitosSheetData({
      comprobante: "FACTURA", factura_numero: "0002-000018452",
      items: [{ material: "Chapa", precio_unitario: 123.50, moneda: "ARS" }],
    }, "2026-10-01T12:00:00Z"));
    const row = (data.rows as Record<string, string>[])[0];
    expect(row.Comprobante).toBe("FACTURA");
    expect(row["Precio Unitario"]).toBe("123.5");
    expect(row).not.toHaveProperty("moneda");
    expect(normalizeBusinessKey("remitos", data)).toBe("18452");
  });

  it("requires the invoice's own number and rejects an unsupported document type", () => {
    expect(() => validateModuleData("remitos", prepareRemitosSheetData({ comprobante: "FACTURA", remito: "123" }, "2026-10-01T12:00:00Z"))).toThrow();
    expect(() => validateModuleData("remitos", prepareRemitosSheetData({ comprobante: "OTRO", comprobante_numero: "123" }, "2026-10-01T12:00:00Z"))).toThrow();
  });
  it("normalizes leading zeroes only for the remito business key", () => {
    expect(normalizeBusinessKey("remitos", { remito_aux: "00018452" })).toBe("18452");
    expect(normalizeBusinessKey("cheques", { numero_cheque: "00182746" })).toBe("00182746");
  });

  it("requires the N° POLO key for chapas", () => {
    expect(() => validateModuleData("chapas", { "N° POLO": "" })).toThrow(/N° POLO/);
  });

  it("preserves an eight-digit cheque number and validates critical fields", () => {
    const result = validateModuleData("cheques", prepareSheetFormData("cheques", {
      numero_cheque: "00182746",
      fecha_pago_diferido: "2026-10-30",
      monto_numeros: "1250000,50",
      librador_cuit: "30-71234567-8",
      endosos: [],
    }, "2026-10-01T12:00:00Z"));
    expect(result["Nº DE CHEQUE"]).toBe("00182746");
    expect(result["MONTO EN PESOS"]).toBe("1250000.50");
  });

  it("rejects invalid cheque critical fields", () => {
    expect(() =>
      validateModuleData("cheques", {
        "Nº DE CHEQUE": "123",
        "FECHA DE PAGO DIFERIDO": "30/10/2026",
        "MONTO EN PESOS": "texto",
      }),
    ).toThrow();
  });
});
