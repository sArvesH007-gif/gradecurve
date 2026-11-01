import "server-only";
import oracledb from "oracledb";
import { getCurrentUser } from "@/lib/auth/session";
import { logOracleFailure, oracleErrorResponse, withOracleConnection } from "@/lib/oracle/client";

type OracleTeacher = {
  sessionUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  oracleUserId: number;
  oracleTeacherId: number;
};

type OracleStudent = {
  sessionUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  oracleUserId: number;
  oracleStudentId: number;
};

function numericUserId(value: string) {
  const userId = Number(value);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

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

  const oracleUserId = numericUserId(sessionUser.id);
  if (oracleUserId == null)
    return { response: Response.json({ error: "The teacher session is invalid." }, { status: 401 }) };

  let result;
  try {
    result = await withOracleConnection((connection) =>
      connection.execute<{
        USER_ID: number;
        TEACHER_ID: number;
      }>(
        `SELECT u.user_id, tp.teacher_id
         FROM users u
         JOIN teacher_profiles tp ON tp.user_id = u.user_id
         WHERE u.user_id = :userId AND u.username = :username AND u.user_role = 'TEACHER'`,
        { userId: oracleUserId, username: sessionUser.username },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
    );
  } catch (error) {
    logOracleFailure(error);
    return { response: oracleErrorResponse(error) };
  }
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

export async function requireOracleStudent(): Promise<
  { student: OracleStudent; response?: never } | { student?: never; response: Response }
> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser)
    return { response: Response.json({ error: "Sign in to view student data." }, { status: 401 }) };
  if (sessionUser.role !== "STUDENT")
    return { response: Response.json({ error: "Student access is required." }, { status: 403 }) };
  const oracleUserId = numericUserId(sessionUser.id);
  if (oracleUserId == null)
    return { response: Response.json({ error: "The student session is invalid." }, { status: 401 }) };
  let result;
  try {
    result = await withOracleConnection((connection) =>
      connection.execute<{ studentId: number }>(
        `SELECT sp.student_id AS "studentId"
         FROM users u JOIN student_profiles sp ON sp.user_id = u.user_id
         WHERE u.user_id = :userId AND u.username = :username AND u.user_role = 'STUDENT'`,
        { userId: oracleUserId, username: sessionUser.username },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
    );
  } catch (error) {
    logOracleFailure(error);
    return { response: oracleErrorResponse(error) };
  }
  const studentId = result.rows?.[0]?.studentId;
  if (studentId == null)
    return { response: Response.json({ error: "Student profile was not found." }, { status: 404 }) };
  return { student: { sessionUser, oracleUserId, oracleStudentId: Number(studentId) } };
}
