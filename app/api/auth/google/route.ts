import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { appPath } from "@/lib/app-path";
import { startGoogleLogin, GOOGLE_FLOW_COOKIE, authCookieOptions } from "@/lib/google-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    enforceRateLimit(`google-login:${requestIp(request)}`, 20, 15 * 60 * 1000);
    const flow = await startGoogleLogin();
    const response = NextResponse.redirect(flow.url);
    response.cookies.set(GOOGLE_FLOW_COOKIE, flow.cookie, { ...authCookieOptions(), maxAge: 600 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.redirect(new URL(appPath("/login?error=google_unavailable"), config.appOrigin));
  }
}
