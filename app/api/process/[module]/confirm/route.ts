import { prepareSheetFormData, CHEQUE_DROPDOWNS } from "@/lib/sheet-forms";
import { sheetOptionsRequest } from "@/lib/sheet-options";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/errors";
import {
  acquireConfirmationLock,
  cleanupExpired,
  loadPendingFile,
  loadReceipt,
  releaseConfirmationLock,
  saveReceipt,
} from "@/lib/files";
import { isModuleSlug, moduleDefinitions, normalizeBusinessKey, validateModuleData } from "@/lib/modules";
import { confirmWithN8n } from "@/lib/n8n";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, requireModuleAccess } from "@/lib/security";
import { logEvent } from "@/lib/logger";
import { prepareRemitosSheetData } from "@/lib/remitos-sheet";

const bodySchema = z.object({
  requestId: z.string().uuid(),
  data: z.record(z.string(), z.unknown()),
});

export async function POST(request: NextRequest, context: { params: Promise<{ module: string }> }) {
  let lockedRequestId: string | undefined;
  try {
    assertSameOrigin(request);
    const { module: value } = await context.params;
    if (!isModuleSlug(value)) throw new AppError("UNKNOWN_MODULE", "El módulo no existe.", 404);
    const user = await requireModuleAccess(value);
    enforceRateLimit(`confirm:${user.id}`, 20, 10 * 60 * 1000);
    await cleanupExpired();
    const body = bodySchema.parse(await request.json());
    const priorReceipt = await loadReceipt(body.requestId, user.id, value);
    if (priorReceipt) return NextResponse.json(priorReceipt);

    const pending = await loadPendingFile(body.requestId, user.id, value);
    await acquireConfirmationLock(body.requestId);
    lockedRequestId = body.requestId;

    const data = validateModuleData(value, value === "remitos"
      ? prepareRemitosSheetData(body.data, pending.metadata.createdAt) : prepareSheetFormData(value, body.data, pending.metadata.createdAt));
    const key = normalizeBusinessKey(value, data);
    if (value === "cheques") {
      const { options } = await sheetOptionsRequest("cheques", "read");
      const invalid = CHEQUE_DROPDOWNS.filter((field) => data[field] && !options[field]?.includes(String(data[field])));
      if (invalid.length) throw new AppError("INVALID_SHEET_OPTION", "Elegí una opción de la lista o agregala antes de confirmar.", 422, false,
        Object.fromEntries(invalid.map((field) => [field, ["Esta opción no está en Google Sheets."]])));
    }
    if (!key) {
      throw new AppError(
        "MISSING_RECORD_KEY",
        `${moduleDefinitions[value].keyLabel} es obligatorio para guardar.`,
        422,
      );
    }
    if (value !== "remitos") data[moduleDefinitions[value].keyField] = key;
    const receipt = await confirmWithN8n(pending.metadata, pending.bytes, data);
    await saveReceipt(body.requestId, user.id, value, receipt);
    await releaseConfirmationLock(body.requestId);
    lockedRequestId = undefined;
    logEvent("info", "document_confirmed", {
      requestId: body.requestId,
      userId: user.id,
      module: value,
      operation: receipt.operation,
    });
    return NextResponse.json(receipt);
  } catch (error) {
    if (lockedRequestId) await releaseConfirmationLock(lockedRequestId);
    return errorResponse(error);
  }
}
