import "server-only";
import oracledb from "oracledb";
import { getCurrentUser } from "@/lib/auth/session";
import { withOracleConnection } from "@/lib/oracle/client";

type OracleTeacher = {
  sessionUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  oracleUserId: number;
  oracleTeacherId: number;
};

export async function requireOracleTeacher(): Promise<
  { teacher: OracleTeacher; response?: never } | { teacher?: never; response: Response }
> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser)
    return {
      response: Response.json({ error: "Sign in to use the Oracle DA2 workspace." }, { status: 401 }),
    };
  if (sessionUser.role !== "TEACHER")
    return {
      response: Response.json({ error: "Teacher access is required." }, { status: 403 }),
    };

  const result = await withOracleConnection((connection) =>
    connection.execute<{
      USER_ID: number;
      TEACHER_ID: number;
    }>(
      `SELECT u.user_id, tp.teacher_id
       FROM users u
       JOIN teacher_profiles tp ON tp.user_id = u.user_id
       WHERE u.username = :username AND u.user_role = 'TEACHER'`,
      { username: sessionUser.username },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    ),
  );
  const row = result.rows?.[0];
  if (!row)
    return {
      response: Response.json(
        { error: "This teacher account has no matching Oracle demo faculty record." },
        { status: 403 },
      ),
    };

  return {
    teacher: {
      sessionUser,
      oracleUserId: Number(row.USER_ID),
      oracleTeacherId: Number(row.TEACHER_ID),
    },
  };
}
