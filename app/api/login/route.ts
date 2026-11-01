import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, sessionCookie } from "@/lib/auth/session";
import oracledb from "oracledb";
import { logOracleFailure, withOracleConnection } from "@/lib/oracle/client";

export const runtime = "nodejs";

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(256),
  role: z.enum(["STUDENT", "TEACHER"]),
});

export async function POST(request: Request) {
  const form = await request.formData();
  const parsed = credentialsSchema.safeParse({
    username: form.get("username"),
    password: form.get("password"),
    role: form.get("role"),
  });
  const destination = new URL("/login", request.url);
  const requestedRole = form.get("role") === "TEACHER" ? "teacher" : "student";

  if (!parsed.success) {
    destination.searchParams.set("role", requestedRole);
    destination.searchParams.set("error", "1");
    return NextResponse.redirect(destination, 303);
  }

  const { username, password, role } = parsed.data;
  let user: { id: number; username: string; name: string; role: "STUDENT" | "TEACHER"; passwordHash: string } | undefined;
  try {
    const result = await withOracleConnection((connection) =>
      connection.execute<{
        id: number;
        username: string;
        name: string;
        role: "STUDENT" | "TEACHER";
        passwordHash: string;
      }>(
        `SELECT user_id AS "id", username AS "username", full_name AS "name",
                user_role AS "role", password_hash AS "passwordHash"
         FROM users WHERE LOWER(username) = LOWER(:username) AND user_role = :role`,
        { username, role },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
    );
    user = result.rows?.[0];
  } catch (error) {
    logOracleFailure(error);
    destination.searchParams.set("role", requestedRole);
    destination.searchParams.set("error", "service");
    return NextResponse.redirect(destination, 303);
  }
  if (!user || !verifyPassword(password, user.passwordHash)) {
    destination.searchParams.set("role", role.toLowerCase());
    destination.searchParams.set("error", "1");
    return NextResponse.redirect(destination, 303);
  }

  const response = NextResponse.redirect(
    new URL(role === "STUDENT" ? "/student" : "/teacher", request.url),
    303,
  );
  response.cookies.set(
    sessionCookie.name,
    createSessionToken({
      id: String(user.id),
      username: user.username,
      name: user.name,
      role,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: sessionCookie.maxAge,
    },
  );
  return response;
}
