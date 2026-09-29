import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  acquireConfirmationLock,
  loadPendingFile,
  loadReceipt,
  releaseConfirmationLock,
  savePendingFile,
  saveReceipt,
  validateAndReadFile,
} from "@/lib/files";

let testDirectory: string;

beforeAll(async () => {
  testDirectory = await mkdtemp(path.join(tmpdir(), "labruna-docs-"));
  process.env.TEMP_UPLOAD_DIR = testDirectory;
});

afterAll(async () => {
  await rm(testDirectory, { recursive: true, force: true });
});

describe("temporary document storage", () => {
  it("detects actual content instead of trusting the declared MIME type", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const file = new File([png], "documento.exe", { type: "application/octet-stream" });
    const result = await validateAndReadFile("remitos", file);
    expect(result.mimeType).toBe("image/png");
  });

  it("binds pending files and receipts to their user and module", async () => {
    const metadata = await savePendingFile({
      userId: "user-1",
      module: "remitos",
      originalName: "remito.png",
      mimeType: "image/png",
      bytes: Buffer.from("safe-content"),
    });
    const pending = await loadPendingFile(metadata.requestId, "user-1", "remitos");
    expect(pending.metadata.fileHash).toHaveLength(64);
    await expect(loadPendingFile(metadata.requestId, "user-2", "remitos")).rejects.toThrow();

    await acquireConfirmationLock(metadata.requestId);
    await expect(acquireConfirmationLock(metadata.requestId)).rejects.toThrow();
    await releaseConfirmationLock(metadata.requestId);

    const receipt = {
      requestId: metadata.requestId,
      status: "saved" as const,
      operation: "created" as const,
      recordKey: "18452",
      message: "Guardado",
    };
    await saveReceipt(metadata.requestId, "user-1", "remitos", receipt);
    await expect(loadReceipt(metadata.requestId, "user-1", "remitos")).resolves.toEqual(receipt);
    await expect(loadReceipt(metadata.requestId, "user-2", "remitos")).resolves.toBeNull();
  });
});
