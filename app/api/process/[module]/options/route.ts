import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CHEQUE_DROPDOWNS } from "@/lib/sheet-forms";
import { addSheetOption, sheetOptionsRequest } from "@/lib/sheet-options";
import { assertSameOrigin, requireModuleAccess } from "@/lib/security";
import { AppError, errorResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";

async function access(context: { params: Promise<{ module: string }> }) {
  const { module } = await context.params;
  if (module !== "cheques") throw new AppError("UNKNOWN_LIST", "Este módulo no tiene listas desplegables en la planilla.", 404);
  return requireModuleAccess(module);
}
export async function GET(_request: NextRequest, context: { params: Promise<{ module: string }> }) {
  try { await access(context); return NextResponse.json(await sheetOptionsRequest("cheques", "read")); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest, context: { params: Promise<{ module: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await access(context);
    enforceRateLimit(`options:${user.id}`, 20, 10 * 60 * 1000);
    const body = z.object({ field: z.string().refine((field) => CHEQUE_DROPDOWNS.includes(field)), value: z.string().trim().min(1).max(100).refine((value) => !/[\r\n\x00]/.test(value)) }).parse(await request.json());
    return NextResponse.json(await addSheetOption(body.field, body.value));
  } catch (error) { return errorResponse(error); }
}
