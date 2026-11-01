import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { readSessionToken } from "@/lib/auth/session-token";

const { execute, withOracleConnection, logOracleFailure } = vi.hoisted(() => ({
  execute: vi.fn(),
  withOracleConnection: vi.fn(),
  logOracleFailure: vi.fn(),
}));
vi.mock("@/lib/oracle/client", () => ({ withOracleConnection, logOracleFailure }));

import { POST } from "@/app/api/login/route";

const testPassword = randomBytes(32).toString("base64url");
const wrongPassword = randomBytes(32).toString("base64url");
const faculty = {
  id: 47,
  username: "teacher@gradecurve.demo",
  name: "Demo Teacher",
  role: "TEACHER" as const,
};

function postLogin(username: string, password: string, role: "STUDENT" | "TEACHER") {
  const body = new URLSearchParams({ username, password, role });
  return POST(new Request("http://localhost/api/login", { method: "POST", body }));
}

describe("Oracle-backed login route", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
    execute.mockReset();
    withOracleConnection.mockReset();
    logOracleFailure.mockReset();
    withOracleConnection.mockImplementation(async (operation) => operation({ execute }));
  });

  test("rejects invalid credentials without creating a session", async () => {
    execute.mockResolvedValue({ rows: [{ ...faculty, passwordHash: hashPassword(testPassword) }] });
    const response = await postLogin(faculty.username, wrongPassword, "TEACHER");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?role=teacher&error=1");
    expect(response.cookies.get("gc_session")).toBeUndefined();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("FROM users WHERE LOWER(username) = LOWER(:username)"),
      { username: faculty.username, role: "TEACHER" },
      expect.objectContaining({ outFormat: expect.any(Number) }),
    );
  });

  test("sets an HttpOnly twelve-hour session for a verified faculty account", async () => {
    execute.mockResolvedValue({ rows: [{ ...faculty, passwordHash: hashPassword(testPassword) }] });
    const response = await postLogin(faculty.username, testPassword, "TEACHER");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/teacher");
    const cookie = response.cookies.get("gc_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.maxAge).toBe(12 * 60 * 60);
    expect(readSessionToken(cookie?.value)).toMatchObject({ id: String(faculty.id), role: "TEACHER" });
  });

  test("redirects verified Oracle student accounts to the student workspace", async () => {
    execute.mockResolvedValue({ rows: [{ id: 1, username: "24BCE0001", name: "Demo Student 01", role: "STUDENT", passwordHash: hashPassword(testPassword) }] });
    const response = await postLogin("24BCE0001", testPassword, "STUDENT");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/student");
    expect(execute).toHaveBeenCalledWith(expect.any(String), { username: "24BCE0001", role: "STUDENT" }, expect.any(Object));
  });

  test("keeps the requested role on a missing-account lookup", async () => {
    execute.mockResolvedValue({ rows: [] });
    const response = await postLogin("24BCE0001", testPassword, "TEACHER");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?role=teacher&error=1");
  });

  test("redirects safely when Oracle cannot serve account lookup", async () => {
    withOracleConnection.mockRejectedValue(new Error("private connection detail"));
    const response = await postLogin(faculty.username, testPassword, "TEACHER");
    expect(response.headers.get("location")).toBe("http://localhost/login?role=teacher&error=service");
    expect(response.cookies.get("gc_session")).toBeUndefined();
    expect(logOracleFailure).toHaveBeenCalled();
  });
});
