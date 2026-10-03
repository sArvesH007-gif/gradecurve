import { randomBytes } from "node:crypto";
import { expect, test } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

test("password hashes verify without storing a plaintext password", () => {
  const password = randomBytes(32).toString("base64url");
  const incorrect = randomBytes(32).toString("base64url");
  const stored = hashPassword(password);
  expect(stored).not.toContain(password);
  expect(verifyPassword(password, stored)).toBe(true);
  expect(verifyPassword(incorrect, stored)).toBe(false);
});

test("malformed password hashes are rejected", () => {
  expect(verifyPassword(randomBytes(32).toString("base64url"), "not-a-hash")).toBe(false);
});
