import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const ITERATIONS = 310_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return `${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [saltHex, hashHex, extra] = storedHash.split("$");
  if (!saltHex || !hashHex || extra) return false;

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
    const actual = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
