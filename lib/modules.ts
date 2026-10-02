import { z } from "zod";
import { MODULES, type ModuleSlug } from "@/lib/types";
import { CHAPAS_COLUMNS, CHEQUES_COLUMNS, CHEQUE_DROPDOWNS } from "@/lib/sheet-forms";
import { REMITOS_SHEET_HEADERS } from "@/lib/remitos-sheet";

export type FieldType = "text" | "date" | "number" | "textarea" | "items" | "lines" | "select" | "sheetRows";

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  automatic?: boolean;
  sheetOptions?: boolean;
  highlight?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface ModuleDefinition {
  slug: ModuleSlug;
  name: string;
  singular: string;
  description: string;
  accept: string;
  formatsLabel: string;
  keyField: string;
  keyLabel: string;
  fields: FieldDefinition[];
}

const optionalText = z
  .union([z.string(), z.number()])
  .nullish()
  .default("")
  .transform((value) => (value === null || value === undefined ? "" : String(value).trim()));

const requiredText = (label: string) =>
  optionalText.pipe(z.string().min(1, `${label} es obligatorio`));

const dateText = z
  .string()
  .trim()
  .min(1, "La fecha es obligatoria")
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
    "Usá una fecha válida",
  );

const moneyText = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim().replace(/\s/g, "").replace(",", "."))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Ingresá un monto válido"));

export const moduleSchemas = {
  remitos: z.object({ rows: z.array(z.object({
    ...Object.fromEntries(REMITOS_SHEET_HEADERS.map((header) => [header, optionalText])),
    Comprobante: z.enum(["REMITO", "FACTURA"]),
    "N° de Comprobante": requiredText("El número de comprobante"),
  })).min(1, "Agregá al menos un artículo") }),
  chapas: z.object({
    ...Object.fromEntries(CHAPAS_COLUMNS.map(({ key }) => [key, optionalText])),
    "N° POLO": requiredText("N° POLO"),
  }),
  cheques: z.object({
    ...Object.fromEntries(CHEQUES_COLUMNS.map(({ key }) => [key, optionalText])),
    "Nº DE CHEQUE": optionalText.pipe(z.string().regex(/^\d{8}$/, "El número de cheque debe tener exactamente 8 dígitos")),
    "FECHA DE PAGO DIFERIDO": dateText,
    "MONTO EN PESOS": moneyText,
  }),
} satisfies Record<ModuleSlug, z.ZodType<Record<string, unknown>>>;

export const moduleDefinitions: Record<ModuleSlug, ModuleDefinition> = {
  remitos: {
    slug: "remitos",
    name: "Remitos y facturas",
    singular: "comprobante",
    description: "Remitos y facturas con materiales, cantidades y referencias comerciales.",
    accept: "image/jpeg,image/png,image/webp",
    formatsLabel: "JPG, PNG o WebP",
    keyField: "comprobante_numero",
    keyLabel: "N° de comprobante",
    fields: [
      { key: "rows", label: "Artículos", type: "sheetRows" },
    ],
  },
  chapas: {
    slug: "chapas",
    name: "Chapas",
    singular: "pedido de chapa",
    description: "Planos, medidas, materiales y archivos procesados.",
    accept: "image/jpeg,image/png,image/webp",
    formatsLabel: "JPG, PNG o WebP",
    keyField: "N° POLO",
    keyLabel: "N° POLO",
    fields: CHAPAS_COLUMNS.map((column) => ({
      ...column, type: "text",
      sheetOptions: false,
      required: column.key === "N° POLO",
    })),
  },
  cheques: {
    slug: "cheques",
    name: "Cheques",
    singular: "cheque",
    description: "Datos bancarios con revisión obligatoria antes de guardar.",
    accept: "image/jpeg,image/png,image/webp,application/pdf",
    formatsLabel: "JPG, PNG, WebP o PDF",
    keyField: "Nº DE CHEQUE",
    keyLabel: "N° de cheque",
    fields: CHEQUES_COLUMNS.map((column) => ({
      ...column, type: CHEQUE_DROPDOWNS.includes(column.key) ? "select" : "text",
      sheetOptions: CHEQUE_DROPDOWNS.includes(column.key),
      required: column.key === "Nº DE CHEQUE",
    })),
  },
};

export function isModuleSlug(value: string): value is ModuleSlug {
  return (MODULES as readonly string[]).includes(value);
}

export function isFeatureEnabled(module: ModuleSlug): boolean {
  const key = `FEATURE_${module.toUpperCase()}`;
  return (process.env[key] ?? (module === "remitos" ? "true" : "false")).toLowerCase() === "true";
}

export function enabledModules(): ModuleSlug[] {
  return MODULES.filter(isFeatureEnabled);
}

export function validateModuleData(module: ModuleSlug, data: unknown): Record<string, unknown> {
  return moduleSchemas[module].parse(data);
}

export function normalizeBusinessKey(module: ModuleSlug, data: Record<string, unknown>): string {
  if (module === "remitos") {
    if (Array.isArray(data.rows)) return normalizeDocumentNumber(data.rows[0]?.["N° de Comprobante"]);
    const candidate = data.comprobante_numero ||
      (data.comprobante === "FACTURA" ? data.factura_numero : data.remito_aux || data.remito);
    return normalizeDocumentNumber(candidate);
  }
  const field = moduleDefinitions[module].keyField;
  const raw = String(data[field] ?? data[module === "chapas" ? "N_POLO" : "numero_cheque"] ?? "").trim();
  return raw;
}

function normalizeDocumentNumber(value: unknown): string {
  return String(value ?? "").trim().split("-").pop()!.trim().replace(/^0+(?=\d)/, "");
}
