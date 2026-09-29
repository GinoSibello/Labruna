import { z } from "zod";
import { MODULES, type ModuleSlug } from "@/lib/types";

export type FieldType = "text" | "date" | "number" | "textarea" | "items" | "lines";

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  highlight?: boolean;
  placeholder?: string;
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

const itemSchema = z.object({
  material: optionalText,
  unidades: optionalText,
  kg: optionalText,
  mts: optionalText,
  litros: optionalText,
  unidad_medida: optionalText,
  lote: optionalText,
});

export const moduleSchemas = {
  remitos: z.object({
    proveedor: optionalText,
    remito: optionalText,
    remito_aux: requiredText("El número de remito"),
    fecha: optionalText,
    cliente: optionalText,
    factura_numero: optionalText,
    transporte_numero: optionalText,
    ped_cliente_nro: optionalText,
    destino: optionalText,
    items: z.array(itemSchema).default([]),
  }),
  chapas: z.object({
    fecha: optionalText,
    cliente: optionalText,
    proyecto: optionalText,
    material: optionalText,
    color_material: optionalText,
    espesor_material_mm: optionalText,
    total_suma_interna_mm: optionalText,
    desarrollo: optionalText,
    pintura: optionalText,
    cantidad_total: optionalText,
    N_POLO: requiredText("N° POLO"),
    arquitecto: optionalText,
  }),
  cheques: z.object({
    banco: optionalText,
    tipo_cheque: optionalText,
    numero_cheque: optionalText.pipe(
      z.string().regex(/^\d{8}$/, "El número de cheque debe tener exactamente 8 dígitos"),
    ),
    fecha_emision: optionalText,
    fecha_pago_diferido: dateText,
    domicilio_pago: optionalText,
    monto_numeros: moneyText,
    librador_nombre: optionalText,
    librador_cuit: optionalText.refine(
      (value) => value === "" || /^\d{11}$/.test(value.replace(/[-\s]/g, "")),
      "El CUIT/CUIL debe tener 11 dígitos",
    ),
    beneficiario: optionalText,
    endosos: z.array(z.string().trim()).default([]),
  }),
} satisfies Record<ModuleSlug, z.ZodType<Record<string, unknown>>>;

export const moduleDefinitions: Record<ModuleSlug, ModuleDefinition> = {
  remitos: {
    slug: "remitos",
    name: "Remitos",
    singular: "remito",
    description: "Ingresos de materiales, cantidades y referencias comerciales.",
    accept: "image/jpeg,image/png,image/webp",
    formatsLabel: "JPG, PNG o WebP",
    keyField: "remito_aux",
    keyLabel: "N° de remito",
    fields: [
      { key: "remito_aux", label: "N° de remito", type: "text", required: true, highlight: true },
      { key: "proveedor", label: "Proveedor", type: "text" },
      { key: "remito", label: "Remito impreso", type: "text" },
      { key: "fecha", label: "Fecha", type: "date" },
      { key: "cliente", label: "Cliente", type: "text" },
      { key: "factura_numero", label: "N° de factura", type: "text" },
      { key: "transporte_numero", label: "N° de transporte", type: "text" },
      { key: "ped_cliente_nro", label: "Pedido del cliente", type: "text" },
      { key: "destino", label: "Destino", type: "text" },
      { key: "items", label: "Materiales", type: "items" },
    ],
  },
  chapas: {
    slug: "chapas",
    name: "Chapas",
    singular: "pedido de chapa",
    description: "Planos, medidas, materiales y archivos procesados.",
    accept: "image/jpeg,image/png,image/webp",
    formatsLabel: "JPG, PNG o WebP",
    keyField: "N_POLO",
    keyLabel: "N° POLO",
    fields: [
      { key: "N_POLO", label: "N° POLO", type: "text", required: true, highlight: true },
      { key: "fecha", label: "Fecha", type: "date" },
      { key: "cliente", label: "Cliente", type: "text" },
      { key: "proyecto", label: "Proyecto", type: "text" },
      { key: "arquitecto", label: "Diseñador del plano", type: "text" },
      { key: "material", label: "Material", type: "text" },
      { key: "color_material", label: "Color", type: "text" },
      { key: "espesor_material_mm", label: "Espesor (mm)", type: "number" },
      { key: "total_suma_interna_mm", label: "Suma interna (mm)", type: "number" },
      { key: "desarrollo", label: "Desarrollo", type: "number" },
      { key: "pintura", label: "Pintura", type: "text" },
      { key: "cantidad_total", label: "Cantidad total", type: "number" },
    ],
  },
  cheques: {
    slug: "cheques",
    name: "Cheques",
    singular: "cheque",
    description: "Datos bancarios con revisión obligatoria antes de guardar.",
    accept: "image/jpeg,image/png,image/webp,application/pdf",
    formatsLabel: "JPG, PNG, WebP o PDF",
    keyField: "numero_cheque",
    keyLabel: "N° de cheque",
    fields: [
      { key: "numero_cheque", label: "N° de cheque", type: "text", required: true, highlight: true },
      { key: "monto_numeros", label: "Monto", type: "number", required: true, highlight: true },
      { key: "fecha_pago_diferido", label: "Fecha de pago", type: "date", required: true, highlight: true },
      { key: "banco", label: "Banco", type: "text" },
      { key: "tipo_cheque", label: "Tipo de cheque", type: "text" },
      { key: "fecha_emision", label: "Fecha de emisión", type: "date" },
      { key: "domicilio_pago", label: "Domicilio de pago", type: "text" },
      { key: "librador_nombre", label: "Librador", type: "text", highlight: true },
      { key: "librador_cuit", label: "CUIT/CUIL", type: "text" },
      { key: "beneficiario", label: "Beneficiario", type: "text" },
      { key: "endosos", label: "Endosos", type: "lines" },
    ],
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
  const field = moduleDefinitions[module].keyField;
  const raw = String(data[field] ?? "").trim();
  if (module === "remitos") return raw.replace(/^0+(?=\d)/, "");
  return raw;
}
