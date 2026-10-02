import type { NextRequest } from "next/server";
import type { SessionUser, ModuleSlug } from "@/lib/types";
import { currentUser } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { config } from "@/lib/config";
import { isFeatureEnabled } from "@/lib/modules";

export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (!origin) throw new AppError("INVALID_ORIGIN", "Solicitud rechazada.", 403);
  if (origin.replace(/\/$/, "") !== config.appOrigin) {
    throw new AppError("INVALID_ORIGIN", "Solicitud rechazada.", 403);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Tu sesión venció. Volvé a ingresar.", 401);
  return user;
}

export async function requireModuleAccess(module: ModuleSlug): Promise<SessionUser> {
  const user = await requireUser();
  if (!isFeatureEnabled(module)) {
    throw new AppError("MODULE_DISABLED", "Este módulo todavía no está habilitado.", 404);
  }
  if (!user.allowedModules.includes(module)) {
    throw new AppError("FORBIDDEN", "No tenés permiso para usar este módulo.", 403);
  }
  return user;
}

export function requestIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
