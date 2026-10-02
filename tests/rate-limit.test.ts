import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { clearRateLimitsForTests, enforceRateLimit } from "@/lib/rate-limit";

describe("rate limiter", () => {
  beforeEach(clearRateLimitsForTests);

  it("allows requests up to the configured limit", () => {
    expect(() => {
      enforceRateLimit("user", 2, 60_000);
      enforceRateLimit("user", 2, 60_000);
    }).not.toThrow();
  });

  it("rejects requests over the limit", () => {
    enforceRateLimit("user", 1, 60_000);
    expect(() => enforceRateLimit("user", 1, 60_000)).toThrow(AppError);
  });
});
