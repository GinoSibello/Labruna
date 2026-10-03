import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { startGoogleLogin, verifyGoogleFlow, verifyGoogleIdToken } from "@/lib/google-auth";
import { authorizeGoogleUser } from "@/lib/web-authorization";
import { createSessionToken, verifySessionToken } from "@/lib/session";
import workflow from "../docs/n8n-workflows/google-authorization.json";
import { NextRequest } from "next/server";
import * as googleAuth from "@/lib/google-auth";
import { GET as callback } from "@/app/api/auth/google/callback/route";

let privateKey: CryptoKey;
let keys: JWTVerifyGetKey;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: "test-google", alg: "RS256" }] });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function configure() {
  vi.stubEnv("AUTH_PROVIDER", "google");
  vi.stubEnv("APP_ORIGIN", "https://labruna.aeye.com.ar");
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-test");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret-test");
  vi.stubEnv("SESSION_SECRET", "session-secret-test-at-least-32-characters");
  vi.stubEnv("N8N_AUTH_AUTHORIZE_URL", "https://n8n.example.test/webhook/auth");
  vi.stubEnv("N8N_WEBHOOK_SECRET", "header-secret-test");
}

async function identityToken(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ nonce: "expected-nonce", email: "operator@example.com", email_verified: true, ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "test-google" })
    .setSubject("google-account-123").setIssuer("https://accounts.google.com")
    .setAudience("google-client-test").setIssuedAt().setExpirationTime("5m").sign(privateKey);
}

function allowed(email = "operator@example.com", modules: string[] = ["remitos", "chapas", "cheques"]) {
  return new Response(JSON.stringify({ authorized: true, user: { name: "Labruna", email, profile: "Labruna", allowedModules: modules } }), { status: 200 });
}

describe("Google OpenID Connect", () => {
  it("requests only identity scopes with PKCE and rejects wrong, tampered or expired flow cookies", async () => {
    configure();
    const { cookie, url } = await startGoogleLogin();
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("redirect_uri")).toBe("https://labruna.aeye.com.ar/api/auth/google/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const state = url.searchParams.get("state")!;
    const flow = await verifyGoogleFlow(cookie, state);
    expect(flow.nonce).toBe(url.searchParams.get("nonce"));
    expect(flow.verifier).not.toBe(url.searchParams.get("code_challenge"));
    await expect(verifyGoogleFlow(cookie, "wrong-state")).rejects.toThrow();
    await expect(verifyGoogleFlow(`${cookie}tampered`, state)).rejects.toThrow();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    await expect(verifyGoogleFlow(cookie, state)).rejects.toThrow();
  });

  it("verifies Google's signed identity and rejects unverified email, wrong nonce and client", async () => {
    configure();
    await expect(verifyGoogleIdToken(await identityToken(), "expected-nonce", keys)).resolves.toEqual({
      sub: "google-account-123", email: "operator@example.com",
    });
    await expect(verifyGoogleIdToken(await identityToken({ email_verified: false }), "expected-nonce", keys)).rejects.toThrow();
    await expect(verifyGoogleIdToken(await identityToken(), "other-nonce", keys)).rejects.toThrow();
    await expect(verifyGoogleIdToken(await identityToken({ azp: "another-client" }), "expected-nonce", keys)).rejects.toThrow();
    vi.stubEnv("GOOGLE_CLIENT_ID", "another-client");
    await expect(verifyGoogleIdToken(await identityToken(), "expected-nonce", keys)).rejects.toThrow();
  });
});

describe("authorization through n8n", () => {
  it("binds permission data to the verified email and refuses a mismatched or invalid response", async () => {
    configure();
    const fetcher = vi.fn().mockResolvedValueOnce(allowed("other@example.com"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authorized: true, user: { profile: "owner" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authorized: false })));
    vi.stubGlobal("fetch", fetcher);
    await expect(authorizeGoogleUser("mismatch", "operator@example.com", true)).rejects.toThrow();
    await expect(authorizeGoogleUser("invalid", "operator@example.com", true)).rejects.toThrow();
    await expect(authorizeGoogleUser("denied", "operator@example.com", true)).resolves.toBeNull();
    expect(fetcher.mock.calls[0][1].headers["X-Workflow-Key"]).toBe("header-secret-test");
  });

  it("revalidates permissions and revokes an existing signed Google session after cache expiry", async () => {
    configure();
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(allowed())
      .mockResolvedValueOnce(allowed("operator@example.com", ["remitos"]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authorized: false })));
    vi.stubGlobal("fetch", fetcher);
    const user = await authorizeGoogleUser("revocation-test", "operator@example.com", true);
    const token = await createSessionToken(user!);
    await expect(verifySessionToken(token)).resolves.toMatchObject({ profile: "Labruna", allowedModules: ["remitos", "chapas", "cheques"] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61000);
    await expect(verifySessionToken(token)).resolves.toMatchObject({ allowedModules: ["remitos"] });
    vi.advanceTimersByTime(61000);
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("does not use expired authorization during a webhook outage or use document mock mode for login", async () => {
    configure();
    vi.stubEnv("N8N_MOCK_MODE", "true");
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(allowed()).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    await authorizeGoogleUser("outage-test", "operator@example.com", true);
    vi.advanceTimersByTime(61000);
    await expect(authorizeGoogleUser("outage-test", "operator@example.com")).rejects.toThrow("No pudimos validar");
  });
});

describe("Google callback route", () => {
  it("rejects callbacks without the browser flow and clears an old session", async () => {
    configure();
    const response = await callback(new NextRequest("https://labruna.aeye.com.ar/api/auth/google/callback?code=fake&state=fake"));
    expect(response.headers.get("location")).toBe("https://labruna.aeye.com.ar/login?error=google_unavailable");
    expect(response.cookies.get("labruna_session")?.value).toBe("");
    expect(response.cookies.get("labruna_google_flow")?.value).toBe("");
  });

  it("sets a signed HttpOnly session only after Google identity and Sheet authorization", async () => {
    configure();
    const flow = await startGoogleLogin();
    vi.spyOn(googleAuth, "exchangeGoogleCode").mockResolvedValue({ sub: "callback-account", email: "operator@example.com" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(allowed()));
    const url = new URL("https://labruna.aeye.com.ar/api/auth/google/callback");
    url.searchParams.set("state", flow.url.searchParams.get("state")!);
    url.searchParams.set("code", "google-code-test");
    const response = await callback(new NextRequest(url, { headers: { cookie: `labruna_google_flow=${flow.cookie}` } }));
    expect(response.headers.get("location")).toBe("https://labruna.aeye.com.ar/workspace");
    const session = response.cookies.get("labruna_session")!;
    expect(session.httpOnly).toBe(true);
    expect(session.sameSite).toBe("lax");
    await expect(verifySessionToken(session.value)).resolves.toMatchObject({ id: "google:callback-account", profile: "Labruna" });
    expect(response.cookies.get("labruna_google_flow")?.value).toBe("");
  });

  it("refuses a valid Google account not enabled in the Sheet", async () => {
    configure();
    const flow = await startGoogleLogin();
    vi.spyOn(googleAuth, "exchangeGoogleCode").mockResolvedValue({ sub: "callback-denied", email: "stranger@example.com" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ authorized: false }))));
    const url = new URL("https://labruna.aeye.com.ar/api/auth/google/callback");
    url.searchParams.set("state", flow.url.searchParams.get("state")!);
    url.searchParams.set("code", "google-code-test");
    const response = await callback(new NextRequest(url, { headers: { cookie: `labruna_google_flow=${flow.cookie}` } }));
    expect(response.headers.get("location")).toBe("https://labruna.aeye.com.ar/login?error=not_authorized");
    expect(response.cookies.get("labruna_session")?.value).toBe("");
  });
});

describe("importable n8n authorization workflow", () => {
  const code = workflow.nodes.find((node) => node.name === "Resolver permisos")!.parameters.jsCode!;
  function resolve(rows: Record<string, unknown>[], email = "operator@example.com") {
    const execute = new Function("$input", "$", code);
    return execute({ all: () => rows.map((json) => ({ json })) }, () => ({ first: () => ({ json: { email } }) }))[0].json;
  }
  const row = { row_number: 9, name: "Labruna", email: " Operator@Example.com ", web_profile: "Labruna", web_enabled: "si", auth_remitos: "sí", auth_chapas: "si", auth_cheques: "si" };

  it("enforces exact account membership, enablement and known profiles, including empty Sheets output", () => {
    expect(resolve([row])).toMatchObject({ authorized: true, user: { profile: "Labruna", allowedModules: ["remitos", "chapas", "cheques"] } });
    expect(resolve([{ ...row, web_profile: "devAdmin" }])).toMatchObject({ authorized: true, user: { profile: "devAdmin" } });
    expect(resolve([{}])).toEqual({ authorized: false });
    expect(resolve([row], "stranger@example.com")).toEqual({ authorized: false });
    expect(resolve([{ ...row, web_enabled: "no" }])).toEqual({ authorized: false });
    expect(resolve([{ ...row, web_profile: "owner" }])).toEqual({ authorized: false });
    expect(resolve([{ ...row, auth_cheques: "no" }]).user.allowedModules).toEqual(["remitos", "chapas"]);
    expect(() => resolve([row, row])).toThrow("Correo duplicado");
  });
});
