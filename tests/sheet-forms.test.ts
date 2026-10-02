import { describe, expect, it } from "vitest";
import { CHAPAS_COLUMNS, CHEQUES_COLUMNS, prepareSheetFormData } from "@/lib/sheet-forms";
import { normalizeBusinessKey, validateModuleData } from "@/lib/modules";

describe("sheet-specific review", () => {
  it("keeps both Fecha columns distinct, removes non-Sheet fields and preserves user edits", () => {
    const data = prepareSheetFormData("chapas", { N_POLO: "0012", arquitecto: "Diseñador", pintura: "NO DEBE APARECER", column_P: "2026-11-02", "N° CARMON": "88", "Precio x Kg en USD": "3" }, "2027-01-01T02:30:00Z");
    expect(Object.keys(data)).toEqual(CHAPAS_COLUMNS.map(column => column.key));
    expect(data.Fecha).toBe("31/12/26");
    expect(data.column_P).toBe("2026-11-02");
    expect(data["N° CARMON"]).toBe("88");
    expect(data["Diseñador del Plano"]).toBe("Diseñador");
    expect(data).not.toHaveProperty("pintura");
    expect(normalizeBusinessKey("chapas", validateModuleData("chapas", data))).toBe("0012");
  });
  it("uses all 16 cheque headers, automatic intake date and editable cheque dates and lists", () => {
    const data = prepareSheetFormData("cheques", { numero_cheque: "00123456", fecha_pago_diferido: "2026-12-20", monto_numeros: "34,50", EMPRESA: "LABRUNA", "ESTADO DEL CHEQUE": "CARTERA", tipo_cheque: "not a column", "FECHA DE ING.": "bad", MES: "bad" }, "2026-10-01T12:00:00Z");
    expect(Object.keys(data)).toEqual(CHEQUES_COLUMNS.map(column => column.key));
    expect(data["FECHA DE ING."]).toBe("01/10/2026");
    expect(data.MES).toBe("octubre");
    expect(data["FECHA DE PAGO DIFERIDO"]).toBe("2026-12-20");
    expect(data.EMPRESA).toBe("LABRUNA");
    expect(data).not.toHaveProperty("tipo_cheque");
    expect(normalizeBusinessKey("cheques", validateModuleData("cheques", data))).toBe("00123456");
  });
});
