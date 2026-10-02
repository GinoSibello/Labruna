import { z } from "zod";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";

export const optionsSchema = z.object({ options: z.record(z.string(), z.array(z.string())) });
export async function sheetOptionsRequest(module: "cheques", action: "read" | "add", field?: string, value?: string) {
  const url = process.env.N8N_SHEET_OPTIONS_URL;
  if (!url || !config.n8nSecret) throw new AppError("OPTIONS_NOT_CONFIGURED", "Las listas de la planilla todavía no están conectadas.", 503);
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Workflow-Key": config.n8nSecret },
    body: JSON.stringify({ module, action, field, value }), cache: "no-store", signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new AppError("SHEET_OPTIONS_ERROR", "No pudimos actualizar las listas de Google Sheets. La nueva opción no se agregó.", 502);
  return optionsSchema.parse(await response.json());
}

// Serialize additions in this single app instance, including a fresh read in n8n.
let additions: Promise<unknown> = Promise.resolve();
export function addSheetOption(field: string, value: string) {
  const operation = additions.catch(() => undefined).then(() => sheetOptionsRequest("cheques", "add", field, value));
  additions = operation;
  return operation;
}
