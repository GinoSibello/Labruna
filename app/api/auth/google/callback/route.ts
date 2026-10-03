import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { appPath } from "@/lib/app-path";
import { authCookieOptions, exchangeGoogleCode, GOOGLE_FLOW_COOKIE, verifyGoogleFlow } from "@/lib/google-auth";
import { authorizeGoogleUser } from "@/lib/web-authorization";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { logEvent } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let response: NextResponse;
  try {
    const state = request.nextUrl.searchParams.get("state");
    const cookie = request.cookies.get(GOOGLE_FLOW_COOKIE)?.value;
    if (!state || !cookie) throw new Error("Missing OAuth flow");
    const flow = await verifyGoogleFlow(cookie, state);
    if (request.nextUrl.searchParams.has("error")) {
      response = NextResponse.redirect(new URL(appPath("/login?error=google_cancelled"), config.appOrigin));
    } else {
      const code = request.nextUrl.searchParams.get("code");
      if (!code) throw new Error("Missing Google code");
      const identity = await exchangeGoogleCode(code, flow.verifier, flow.nonce);
      const user = await authorizeGoogleUser(identity.sub, identity.email, true);
      if (!user) {
        response = NextResponse.redirect(new URL(appPath("/login?error=not_authorized"), config.appOrigin));
      } else {
        response = NextResponse.redirect(new URL(appPath("/workspace"), config.appOrigin));
        response.cookies.set(SESSION_COOKIE, await createSessionToken(user), { ...authCookieOptions(), maxAge: config.sessionTtlSeconds });
        logEvent("info", "google_login_succeeded", { userId: user.id, profile: user.profile });
      }
    }
  } catch {
    logEvent("warn", "google_login_failed", {});
    response = NextResponse.redirect(new URL(appPath("/login?error=google_unavailable"), config.appOrigin));
  }
  response.cookies.set(GOOGLE_FLOW_COOKIE, "", { ...authCookieOptions(), maxAge: 0 });
  // A failed account switch must not keep the previous application's session.
  if (!response.cookies.has(SESSION_COOKIE)) response.cookies.set(SESSION_COOKIE, "", { ...authCookieOptions(), maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
