import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_LIFETIME_SECONDS = 60 * 60 * 12;

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: "STUDENT" | "TEACHER";
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32 || value.startsWith("replace-with-")) {
    throw new Error(
      "Set a random AUTH_SECRET of at least 32 characters before using sessions.",
    );
  }
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(user: SessionUser) {
  const payload = Buffer.from(
    JSON.stringify({
      ...user,
      exp: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(
  token: string | undefined,
): SessionUser | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  try {
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return null;
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as SessionUser & { exp: number };
    if (
      !Number.isInteger(value.exp) ||
      value.exp <= Math.floor(Date.now() / 1000)
    )
      return null;
    if (
      typeof value.id !== "string" ||
      !value.id ||
      typeof value.username !== "string" ||
      !value.username ||
      typeof value.name !== "string" ||
      !value.name ||
      !["STUDENT", "TEACHER"].includes(value.role)
    )
      return null;
    const { id, username, name, role } = value;
    return { id, username, name, role };
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: "gc_session",
  maxAge: SESSION_LIFETIME_SECONDS,
} as const;
