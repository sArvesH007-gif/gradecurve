import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createSessionToken,
  readSessionToken,
  sessionCookie,
} from "@/lib/auth/session-token";

const student = {
  id: "student-1",
  username: "24BCE0001",
  name: "Demo Student",
  role: "STUDENT" as const,
};

describe("signed sessions", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.AUTH_SECRET;
  });

  test("persists the signed student identity and rejects tampering", () => {
    process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
    const token = createSessionToken(student);
    expect(readSessionToken(token)).toEqual(student);
    expect(readSessionToken(`${token}x`)).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
  });

  test("expires after twelve hours and configures the matching cookie lifetime", () => {
    process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T00:00:00.000Z"));
    const token = createSessionToken(student);
    expect(sessionCookie.maxAge).toBe(12 * 60 * 60);
    vi.advanceTimersByTime(12 * 60 * 60 * 1000);
    expect(readSessionToken(token)).toBeNull();
  });
});
