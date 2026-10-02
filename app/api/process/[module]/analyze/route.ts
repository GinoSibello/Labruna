import { prepareSheetFormData } from "@/lib/sheet-forms";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/errors";
import { cleanupExpired, deletePending, savePendingFile, validateAndReadFile } from "@/lib/files";
import { isModuleSlug, normalizeBusinessKey } from "@/lib/modules";
import { analyzeWithN8n } from "@/lib/n8n";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, requireModuleAccess } from "@/lib/security";
import { logEvent } from "@/lib/logger";
import { prepareRemitosSheetData } from "@/lib/remitos-sheet";

export async function POST(request: NextRequest, context: { params: Promise<{ module: string }> }) {
  let pendingRequestId: string | undefined;
  try {
    assertSameOrigin(request);
    const { module: value } = await context.params;
    if (!isModuleSlug(value)) throw new AppError("UNKNOWN_MODULE", "El módulo no existe.", 404);
    const user = await requireModuleAccess(value);
    enforceRateLimit(`analyze:${user.id}`, 10, 10 * 60 * 1000);
    await cleanupExpired();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("FILE_REQUIRED", "Seleccioná un archivo.", 422);
    const validated = await validateAndReadFile(value, file);
    const metadata = await savePendingFile({ userId: user.id, module: value, ...validated });
    pendingRequestId = metadata.requestId;

    const result = await analyzeWithN8n(metadata, validated.bytes);
    if (value === "remitos") {
      result.data.comprobante_numero = normalizeBusinessKey(value, result.data);
    }
    logEvent("info", "document_analyzed", {
      requestId: metadata.requestId,
      userId: user.id,
      module: value,
      operation: result.operation,
    });
    return NextResponse.json({
      requestId: metadata.requestId,
      module: value,
      status: "review",
      operation: result.operation,
      data: value === "remitos" ? prepareRemitosSheetData(result.data, metadata.createdAt) : prepareSheetFormData(value, result.data, metadata.createdAt),
      warnings: result.warnings,
      expiresAt: metadata.expiresAt,
    });
  } catch (error) {
    if (pendingRequestId) await deletePending(pendingRequestId);
    return errorResponse(error);
  }
}
