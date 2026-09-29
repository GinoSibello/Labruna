import { AppError } from "@/lib/errors";

function positiveNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export const config = {
  get appOrigin() {
    return process.env.APP_ORIGIN?.replace(/\/$/, "") ?? "http://localhost:3000";
  },
  get sessionSecret() {
    const value = process.env.SESSION_SECRET;
    if (process.env.NODE_ENV === "production" && (!value || value.length < 32)) {
      throw new AppError("SERVER_MISCONFIGURED", "La aplicación no está configurada correctamente.", 503);
    }
    return value ?? "development-only-secret-change-before-production";
  },
  get sessionTtlSeconds() {
    return positiveNumber("SESSION_TTL_HOURS", 8) * 60 * 60;
  },
  get usersFile() {
    return process.env.USERS_FILE ?? "config/users.json";
  },
  get tempUploadDir() {
    return process.env.TEMP_UPLOAD_DIR ?? ".data/uploads";
  },
  get tempTtlMs() {
    return positiveNumber("TEMP_UPLOAD_TTL_MINUTES", 30) * 60 * 1000;
  },
  get maxUploadBytes() {
    return positiveNumber("MAX_UPLOAD_MB", 15) * 1024 * 1024;
  },
  get n8nTimeoutMs() {
    return positiveNumber("N8N_TIMEOUT_MS", 120000);
  },
  get n8nSecret() {
    return process.env.N8N_WEBHOOK_SECRET ?? "";
  },
  get mockMode() {
    return (process.env.N8N_MOCK_MODE ?? "false").toLowerCase() === "true";
  },
  get devAuthBypass() {
    return process.env.NODE_ENV !== "production" && (process.env.DEV_AUTH_BYPASS ?? "false") === "true";
  },
};
