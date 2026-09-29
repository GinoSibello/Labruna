import { describe, expect, it } from "vitest";
import { normalizeBusinessKey, validateModuleData } from "@/lib/modules";

describe("module validation", () => {
  it("normalizes leading zeroes only for the remito business key", () => {
    expect(normalizeBusinessKey("remitos", { remito_aux: "00018452" })).toBe("18452");
    expect(normalizeBusinessKey("cheques", { numero_cheque: "00182746" })).toBe("00182746");
  });

  it("requires the N° POLO key for chapas", () => {
    expect(() => validateModuleData("chapas", { N_POLO: "" })).toThrow(/N° POLO/);
  });

  it("preserves an eight-digit cheque number and validates critical fields", () => {
    const result = validateModuleData("cheques", {
      numero_cheque: "00182746",
      fecha_pago_diferido: "2026-10-30",
      monto_numeros: "1250000,50",
      librador_cuit: "30-71234567-8",
      endosos: [],
    });
    expect(result.numero_cheque).toBe("00182746");
    expect(result.monto_numeros).toBe("1250000.50");
  });

  it("rejects invalid cheque critical fields", () => {
    expect(() =>
      validateModuleData("cheques", {
        numero_cheque: "123",
        fecha_pago_diferido: "30/10/2026",
        monto_numeros: "texto",
      }),
    ).toThrow();
  });
});
