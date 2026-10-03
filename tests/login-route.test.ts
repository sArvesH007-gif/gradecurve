import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { readSessionToken } from "@/lib/auth/session-token";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findFirst } } }));

import { POST } from "@/app/api/login/route";

const testPassword = randomBytes(32).toString("base64url");
const wrongPassword = randomBytes(32).toString("base64url");
const user = {
  id: "teacher-1",
  username: "teacher@gradecurve.demo",
  name: "Demo Teacher",
  role: "TEACHER" as const,
  passwordHash: "",
};

function postLogin(
  username: string,
  password: string,
  role: "STUDENT" | "TEACHER",
) {
  const body = new URLSearchParams({ username, password, role });
  return POST(
    new Request("http://localhost/api/login", { method: "POST", body }),
  );
}

describe("login route", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
    findFirst.mockReset();
  });

  test("rejects invalid credentials without creating a session", async () => {
    findFirst.mockResolvedValue({
      ...user,
      passwordHash: hashPassword(testPassword),
    });
    const response = await postLogin(
      user.username,
      wrongPassword,
      "TEACHER",
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?role=teacher&error=1",
    );
    expect(response.cookies.get("gc_session")).toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith({
      where: { username: user.username, role: "TEACHER" },
    });
  });

  test("sets an HttpOnly twelve-hour session and redirects a verified faculty account", async () => {
    findFirst.mockResolvedValue({
      ...user,
      passwordHash: hashPassword(testPassword),
    });
    const response = await postLogin(
      user.username,
      testPassword,
      "TEACHER",
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/teacher");
    const cookie = response.cookies.get("gc_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.maxAge).toBe(12 * 60 * 60);
    expect(readSessionToken(cookie?.value)).toMatchObject({
      id: user.id,
      role: "TEACHER",
    });
  });

  test("redirects verified student accounts to their own workspace", async () => {
    const passwordHash = hashPassword(testPassword);
    findFirst.mockResolvedValue({
      id: "student-1",
      username: "24BCE0001",
      name: "Demo Student",
      role: "STUDENT",
      passwordHash,
    });
    const response = await postLogin("24BCE0001", testPassword, "STUDENT");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/student");
    expect(findFirst).toHaveBeenCalledWith({
      where: { username: "24BCE0001", role: "STUDENT" },
    });
  });

  test("keeps the chosen role on a failed lookup", async () => {
    findFirst.mockResolvedValue(null);
    const response = await postLogin("24BCE0001", testPassword, "TEACHER");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?role=teacher&error=1",
    );
  });
});
