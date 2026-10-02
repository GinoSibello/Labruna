import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { config } from "@/lib/config";
import { findEnabledUser } from "@/lib/users";
import type { AppUser, SessionUser } from "@/lib/types";

export const SESSION_COOKIE = "labruna_session";

function key() {
  return new TextEncoder().encode(config.sessionSecret);
}

export async function createSessionToken(user: AppUser): Promise<string> {
  return new SignJWT({
    name: user.name,
    email: user.email,
    allowedModules: user.allowedModules,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${config.sessionTtlSeconds}s`)
    .sign(key());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub || !payload.exp) return null;
    const current = await findEnabledUser(payload.sub);
    if (!current) return null;
    return { ...current, exp: payload.exp };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  if (config.devAuthBypass) {
    return {
      id: "local-preview",
      name: "Operador local",
      email: "preview@local.test",
      enabled: true,
      allowedModules: ["remitos", "chapas", "cheques"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  }
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}
