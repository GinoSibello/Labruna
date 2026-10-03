import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { config } from "@/lib/config";
import { appPath, APP_BASE_PATH } from "@/lib/app-path";
import { AppError } from "@/lib/errors";

export const GOOGLE_FLOW_COOKIE = "labruna_google_flow";
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const flowSchema = z.object({ state: z.string().min(32), nonce: z.string().min(32), verifier: z.string().min(43) });

export function authCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: APP_BASE_PATH || "/" };
}

export function googleCallbackUrl() {
  return new URL(appPath("/api/auth/google/callback"), config.appOrigin).toString();
}

export function assertGoogleConfigured() {
  if (config.authProvider !== "google" || !config.googleClientId || !config.googleClientSecret || !config.authWebhookUrl || !config.n8nSecret) {
    throw new AppError("GOOGLE_NOT_CONFIGURED", "El acceso con Google todavía no está configurado.", 503);
  }
}

export async function startGoogleLogin() {
  assertGoogleConfigured();
  const flow = {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
  };
  const cookie = await new SignJWT(flow)
    .setProtectedHeader({ alg: "HS256" }).setAudience("google-login-flow")
    .setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(config.sessionSecret));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.googleClientId, redirect_uri: googleCallbackUrl(), response_type: "code",
    scope: "openid email profile", state: flow.state, nonce: flow.nonce,
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return { url, cookie };
}

export async function verifyGoogleFlow(cookie: string, state: string) {
  const { payload } = await jwtVerify(cookie, new TextEncoder().encode(config.sessionSecret), {
    algorithms: ["HS256"], audience: "google-login-flow", requiredClaims: ["exp", "iat"],
  });
  const flow = flowSchema.parse(payload);
  const expected = Buffer.from(flow.state);
  const actual = Buffer.from(state);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Invalid OAuth state");
  return flow;
}

export async function verifyGoogleIdToken(token: string, nonce: string, keys: JWTVerifyGetKey = googleKeys) {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ["RS256"], issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: config.googleClientId, requiredClaims: ["sub", "exp", "iat", "nonce", "email", "email_verified"],
  });
  if (payload.nonce !== nonce || payload.email_verified !== true ||
      (payload.azp !== undefined && payload.azp !== config.googleClientId) ||
      (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.googleClientId)) {
    throw new Error("Invalid Google identity");
  }
  return { sub: z.string().min(1).parse(payload.sub), email: z.email().parse(payload.email).trim().toLowerCase() };
}

export async function exchangeGoogleCode(code: string, verifier: string, nonce: string) {
  assertGoogleConfigured();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: config.googleClientId, client_secret: config.googleClientSecret,
      redirect_uri: googleCallbackUrl(), grant_type: "authorization_code", code_verifier: verifier }),
    signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  if (!response.ok) throw new Error("Google token exchange failed");
  const body = z.object({ id_token: z.string().min(1) }).parse(await response.json());
  return verifyGoogleIdToken(body.id_token, nonce);
}
