import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import type { ConfirmResponse, ModuleSlug, PendingMetadata } from "@/lib/types";

const allowedTypes: Record<ModuleSlug, Set<string>> = {
  remitos: new Set(["image/jpeg", "image/png", "image/webp"]),
  chapas: new Set(["image/jpeg", "image/png", "image/webp"]),
  cheques: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
};

function paths(requestId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    throw new AppError("INVALID_REQUEST", "La solicitud no es válida.", 400);
  }
  const base = path.resolve(config.tempUploadDir);
  return {
    binary: path.join(base, `${requestId}.bin`),
    metadata: path.join(base, `${requestId}.json`),
    lock: path.join(base, `${requestId}.lock`),
    receipt: path.join(base, `${requestId}.receipt.json`),
  };
}

async function ensureDirectory() {
  await mkdir(config.tempUploadDir, { recursive: true, mode: 0o700 });
}

export async function validateAndReadFile(module: ModuleSlug, file: File) {
  if (!file.size) throw new AppError("EMPTY_FILE", "El archivo está vacío.", 422);
  if (file.size > config.maxUploadBytes) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `El archivo supera el máximo de ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`,
      413,
    );
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !allowedTypes[module].has(detected.mime)) {
    throw new AppError("INVALID_FILE_TYPE", "El contenido del archivo no corresponde a un formato permitido.", 415);
  }
  return {
    bytes,
    mimeType: detected.mime,
    originalName: file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 140) || `documento.${detected.ext}`,
  };
}

export async function savePendingFile(input: {
  userId: string;
  module: ModuleSlug;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<PendingMetadata> {
  await ensureDirectory();
  const requestId = randomUUID();
  const createdAt = new Date();
  const metadata: PendingMetadata = {
    requestId,
    userId: input.userId,
    module: input.module,
    originalName: input.originalName,
    mimeType: input.mimeType,
    fileHash: createHash("sha256").update(input.bytes).digest("hex"),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + config.tempTtlMs).toISOString(),
  };
  const target = paths(requestId);
  await writeFile(target.binary, input.bytes, { mode: 0o600, flag: "wx" });
  await writeFile(target.metadata, JSON.stringify(metadata), { mode: 0o600, flag: "wx" });
  return metadata;
}

export async function loadPendingFile(requestId: string, userId: string, module: ModuleSlug) {
  const target = paths(requestId);
  try {
    const metadata = JSON.parse(
      await readFile(/* turbopackIgnore: true */ target.metadata, "utf8"),
    ) as PendingMetadata;
    if (metadata.userId !== userId || metadata.module !== module) {
      throw new AppError("FORBIDDEN", "Esta solicitud no pertenece a tu sesión.", 403);
    }
    if (Date.parse(metadata.expiresAt) <= Date.now()) {
      await deletePending(requestId);
      throw new AppError("REQUEST_EXPIRED", "La solicitud venció. Volvé a cargar el documento.", 410);
    }
    const bytes = await readFile(/* turbopackIgnore: true */ target.binary);
    if (createHash("sha256").update(bytes).digest("hex") !== metadata.fileHash) {
      throw new AppError("FILE_CORRUPTED", "El archivo temporal no es válido.", 409);
    }
    return { metadata, bytes };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("REQUEST_NOT_FOUND", "No encontramos esta solicitud o ya fue procesada.", 404);
  }
}

export async function acquireConfirmationLock(requestId: string) {
  await ensureDirectory();
  const target = paths(requestId);
  try {
    const handle = await open(/* turbopackIgnore: true */ target.lock, "wx", 0o600);
    await handle.writeFile(new Date().toISOString());
    await handle.close();
  } catch {
    throw new AppError("ALREADY_PROCESSING", "Esta solicitud ya se está confirmando.", 409, true);
  }
}

export async function releaseConfirmationLock(requestId: string) {
  await rm(paths(requestId).lock, { force: true });
}

export async function saveReceipt(
  requestId: string,
  userId: string,
  module: ModuleSlug,
  receipt: ConfirmResponse,
) {
  const target = paths(requestId);
  await writeFile(target.receipt, JSON.stringify({ userId, module, receipt }), { mode: 0o600 });
  await rm(target.binary, { force: true });
  await rm(target.metadata, { force: true });
}

export async function loadReceipt(
  requestId: string,
  userId: string,
  module: ModuleSlug,
): Promise<ConfirmResponse | null> {
  try {
    const envelope = JSON.parse(
      await readFile(/* turbopackIgnore: true */ paths(requestId).receipt, "utf8"),
    ) as {
      userId: string;
      module: ModuleSlug;
      receipt: ConfirmResponse;
    };
    return envelope.userId === userId && envelope.module === module ? envelope.receipt : null;
  } catch {
    return null;
  }
}

export async function deletePending(requestId: string) {
  const target = paths(requestId);
  await Promise.all([
    rm(target.binary, { force: true }),
    rm(target.metadata, { force: true }),
    rm(target.lock, { force: true }),
  ]);
}

let lastCleanup = 0;
export async function cleanupExpired(force = false) {
  if (!force && Date.now() - lastCleanup < 5 * 60 * 1000) return;
  lastCleanup = Date.now();
  await ensureDirectory();
  const entries = await readdir(config.tempUploadDir);
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(config.tempUploadDir, entry);
      try {
        const info = await stat(fullPath);
        const isReceipt = entry.endsWith(".receipt.json");
        const maxAge = isReceipt ? 24 * 60 * 60 * 1000 : config.tempTtlMs + 5 * 60 * 1000;
        if (Date.now() - info.mtimeMs > maxAge) await rm(fullPath, { force: true });
      } catch {
        // Otro request puede haber limpiado el mismo archivo.
      }
    }),
  );
}
