import { readFile, stat } from "node:fs/promises";
import argon2 from "argon2";
import { z } from "zod";
import { config } from "@/lib/config";
import { MODULES, type AppUser, type UserRecord } from "@/lib/types";
import { AppError } from "@/lib/errors";

const userSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().transform((value) => value.toLowerCase()),
  passwordHash: z.string().startsWith("$argon2"),
  enabled: z.boolean(),
  allowedModules: z.array(z.enum(MODULES)),
});

let cache: { modified: number; users: UserRecord[] } | undefined;

export async function loadUsers(): Promise<UserRecord[]> {
  try {
    const info = await stat(config.usersFile);
    if (cache?.modified === info.mtimeMs) return cache.users;
    const parsed = z.array(userSchema).parse(JSON.parse(await readFile(config.usersFile, "utf8")));
    const emails = new Set<string>();
    for (const user of parsed) {
      if (emails.has(user.email)) throw new Error("Duplicate user email");
      emails.add(user.email);
    }
    cache = { modified: info.mtimeMs, users: parsed };
    return parsed;
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "users_file_error", message: String(error) }));
    throw new AppError("SERVER_MISCONFIGURED", "No se pudo cargar la configuración de usuarios.", 503);
  }
}

export async function authenticateUser(email: string, password: string): Promise<AppUser | null> {
  const users = await loadUsers();
  const record = users.find((candidate) => candidate.email === email.trim().toLowerCase());
  if (!record || !record.enabled) return null;
  try {
    if (!(await argon2.verify(record.passwordHash, password))) return null;
  } catch {
    return null;
  }
  const { passwordHash: _passwordHash, ...user } = record;
  return user;
}

export async function findEnabledUser(id: string): Promise<AppUser | null> {
  const users = await loadUsers();
  const record = users.find((candidate) => candidate.id === id && candidate.enabled);
  if (!record) return null;
  const { passwordHash: _passwordHash, ...user } = record;
  return user;
}
