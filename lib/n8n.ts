import { z } from "zod";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { moduleDefinitions, normalizeBusinessKey } from "@/lib/modules";
import type { ConfirmResponse, ModuleOperation, ModuleSlug, PendingMetadata } from "@/lib/types";

const analyzePayloadSchema = z.object({
  operation: z.enum(["create", "update"]),
  data: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()).optional().default([]),
});

const confirmPayloadSchema = z.object({
  operation: z.enum(["created", "updated"]),
  recordKey: z.union([z.string(), z.number()]).transform(String),
  message: z.string().optional(),
});

function endpoint(module: ModuleSlug, action: "ANALYZE" | "CONFIRM") {
  return process.env[`N8N_${module.toUpperCase()}_${action}_URL`] ?? "";
}

function mockAnalysis(module: ModuleSlug): {
  operation: ModuleOperation;
  data: Record<string, unknown>;
  warnings: string[];
} {
  const samples: Record<ModuleSlug, Record<string, unknown>> = {
    remitos: {
      comprobante: "REMITO",
      comprobante_numero: "18452",
      proveedor: "GERDAU",
      remito: "00018452",
      remito_aux: "18452",
      fecha: "2026-09-24",
      cliente: "Labruna",
      factura_numero: "",
      transporte_numero: "TR-9082",
      ped_cliente_nro: "OC-4410",
      destino: "Depósito central",
      items: [
        { material: "Chapa galvanizada", unidades: "12", kg: "864", mts: "", litros: "", unidad_medida: "un", lote: "A-2409" },
      ],
    },
    chapas: {
      fecha: "2026-09-24",
      cliente: "Obra Norte",
      proyecto: "Fachada principal",
      material: "Chapa prepintada",
      color_material: "Gris grafito",
      espesor_material_mm: "0.7",
      total_suma_interna_mm: "612",
      desarrollo: "625",
      pintura: "Ambas caras",
      cantidad_total: "18",
      N_POLO: "P-2481",
      arquitecto: "Estudio Central",
    },
    cheques: {
      banco: "Banco Nación",
      tipo_cheque: "Pago diferido",
      numero_cheque: "00182746",
      fecha_emision: "2026-09-20",
      fecha_pago_diferido: "2026-10-30",
      domicilio_pago: "Buenos Aires",
      monto_numeros: "1250000.00",
      librador_nombre: "Empresa de ejemplo S.A.",
      librador_cuit: "30712345678",
      beneficiario: "Labruna S.A.",
      endosos: [],
    },
  };
  return { operation: "create", data: samples[module], warnings: ["Demostración: datos de ejemplo, no extraídos del archivo."] };
}

async function callWebhook(url: string, formData: FormData) {
  if (!url || !config.n8nSecret) {
    throw new AppError(
      "INTEGRATION_NOT_CONFIGURED",
      "Este módulo todavía no tiene configurada su conexión de procesamiento.",
      503,
    );
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "X-Workflow-Key": config.n8nSecret },
      body: formData,
      signal: AbortSignal.timeout(config.n8nTimeoutMs),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new AppError(
        "PROCESSOR_ERROR",
        "El procesador no pudo completar la operación.",
        response.status >= 500 ? 502 : 422,
        response.status >= 500,
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new AppError(
        "PROCESSOR_TIMEOUT",
        "El análisis tardó más de dos minutos. Podés volver a intentarlo.",
        504,
        true,
      );
    }
    throw new AppError("PROCESSOR_UNAVAILABLE", "No pudimos comunicarnos con el procesador.", 502, true);
  }
}

function appendFile(formData: FormData, metadata: PendingMetadata, bytes: Buffer) {
  formData.set("requestId", metadata.requestId);
  formData.set("source", "web");
  formData.set("userId", metadata.userId);
  formData.set("module", metadata.module);
  formData.set("fileName", metadata.originalName);
  formData.set("mimeType", metadata.mimeType);
  formData.set(
    "file",
    new Blob([new Uint8Array(bytes)], { type: metadata.mimeType }),
    metadata.originalName,
  );
}

export async function analyzeWithN8n(metadata: PendingMetadata, bytes: Buffer) {
  if (config.mockMode) return mockAnalysis(metadata.module);
  const formData = new FormData();
  appendFile(formData, metadata, bytes);
  const payload = await callWebhook(endpoint(metadata.module, "ANALYZE"), formData);
  return analyzePayloadSchema.parse(payload);
}

export async function confirmWithN8n(
  metadata: PendingMetadata,
  bytes: Buffer,
  data: Record<string, unknown>,
): Promise<ConfirmResponse> {
  const recordKey = normalizeBusinessKey(metadata.module, data);
  if (config.mockMode) {
    return {
      requestId: metadata.requestId,
      status: "saved",
      operation: "created",
      recordKey,
      message: "Simulación completada. No se guardó ningún registro en Sheets o Drive.",
    };
  }
  const formData = new FormData();
  appendFile(formData, metadata, bytes);
  formData.set("data", JSON.stringify(data));
  const parsed = confirmPayloadSchema.parse(await callWebhook(endpoint(metadata.module, "CONFIRM"), formData));
  return {
    requestId: metadata.requestId,
    status: "saved",
    operation: parsed.operation,
    recordKey: parsed.recordKey,
    message: parsed.message ?? `${moduleDefinitions[metadata.module].singular} guardado correctamente`,
  };
}
