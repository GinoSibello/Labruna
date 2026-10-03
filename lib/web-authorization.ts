import { z } from "zod";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { MODULES, type AppUser } from "@/lib/types";

const responseSchema = z.discriminatedUnion("authorized", [
  z.object({ authorized: z.literal(false) }),
  z.object({ authorized: z.literal(true), user: z.object({
    name: z.string().trim().min(1), email: z.email().transform((value) => value.trim().toLowerCase()),
    profile: z.enum(["devAdmin", "Labruna"]), allowedModules: z.array(z.enum(MODULES)),
  }) }),
]);
const cache = new Map<string, { until: number; user: AppUser }>();

export async function authorizeGoogleUser(sub: string, email: string, fresh = false): Promise<AppUser | null> {
  const normalized = email.trim().toLowerCase();
  const key = JSON.stringify([config.authWebhookUrl, sub, normalized]);
  const cached = cache.get(key);
  if (!fresh && cached && cached.until > Date.now()) return cached.user;
  cache.delete(key);
  if (!config.authWebhookUrl || !config.n8nSecret) {
    throw new AppError("AUTH_NOT_CONFIGURED", "No está configurada la consulta de usuarios.", 503);
  }
  try {
    const response = await fetch(config.authWebhookUrl, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Workflow-Key": config.n8nSecret },
      body: JSON.stringify({ source: "web", email: normalized }),
      signal: AbortSignal.timeout(15000), cache: "no-store",
    });
    if (!response.ok) throw new Error("Authorization webhook failed");
    const result = responseSchema.parse(await response.json());
    if (!result.authorized) return null;
    if (result.user.email !== normalized) throw new Error("Authorization email mismatch");
    const user: AppUser = { ...result.user, id: `google:${sub}`, enabled: true, authProvider: "google" };
    if (cache.size >= 500) cache.clear();
    cache.set(key, { until: Date.now() + 60000, user });
    return user;
  } catch {
    throw new AppError("AUTH_UNAVAILABLE", "No pudimos validar tu acceso. Volvé a intentarlo en unos minutos.", 503, true);
  }
}
