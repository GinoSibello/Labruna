import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/users";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { config } from "@/lib/config";
import { APP_BASE_PATH } from "@/lib/app-path";
import { assertSameOrigin, requestIp } from "@/lib/security";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AppError, errorResponse } from "@/lib/errors";
import { logEvent } from "@/lib/logger";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(200),
});

export async function POST(request: NextRequest) {
  try {
    if (config.authProvider !== "local") throw new AppError("LOGIN_DISABLED", "Ingresá con tu cuenta de Google.", 403);
    assertSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const ip = requestIp(request);
    enforceRateLimit(`login:${ip}:${body.email.toLowerCase()}`, 5, 15 * 60 * 1000);
    const user = await authenticateUser(body.email, body.password);
    if (!user) {
      logEvent("warn", "login_failed", { ip });
      throw new AppError("INVALID_CREDENTIALS", "El correo o la contraseña no son correctos.", 401);
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(user), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: APP_BASE_PATH || "/",
      maxAge: config.sessionTtlSeconds,
    });
    logEvent("info", "login_succeeded", { userId: user.id });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
