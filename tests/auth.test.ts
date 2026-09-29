import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import argon2 from "argon2";
import { authenticateUser } from "@/lib/users";
import { createSessionToken, verifySessionToken } from "@/lib/session";

let testDirectory: string;

beforeAll(async () => {
  testDirectory = await mkdtemp(path.join(tmpdir(), "labruna-auth-"));
  const usersFile = path.join(testDirectory, "users.json");
  const passwordHash = await argon2.hash("clave-de-prueba-123", { type: argon2.argon2id });
  await writeFile(
    usersFile,
    JSON.stringify([
      {
        id: "operator",
        name: "Operador",
        email: "operator@example.test",
        passwordHash,
        enabled: true,
        allowedModules: ["remitos"],
      },
    ]),
  );
  process.env.USERS_FILE = usersFile;
  process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
});

afterAll(async () => {
  await rm(testDirectory, { recursive: true, force: true });
});

describe("authentication", () => {
  it("accepts valid credentials and rejects an invalid password", async () => {
    await expect(authenticateUser("operator@example.test", "clave-de-prueba-123")).resolves.toMatchObject({
      id: "operator",
      allowedModules: ["remitos"],
    });
    await expect(authenticateUser("operator@example.test", "incorrecta-123")).resolves.toBeNull();
  });

  it("creates a signed session that is revalidated against the user file", async () => {
    const user = await authenticateUser("operator@example.test", "clave-de-prueba-123");
    expect(user).not.toBeNull();
    const token = await createSessionToken(user!);
    await expect(verifySessionToken(token)).resolves.toMatchObject({ id: "operator", email: "operator@example.test" });
    await expect(verifySessionToken(`${token}tampered`)).resolves.toBeNull();
  });
});
