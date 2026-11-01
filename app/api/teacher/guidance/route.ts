import oracledb from "oracledb";
import { z } from "zod";
import { requireOracleTeacher } from "@/lib/oracle/authorization";
import { logOracleFailure, oracleErrorResponse, withOracleConnection } from "@/lib/oracle/client";

export const runtime = "nodejs";
const idSchema = z.string().regex(/^[1-9]\d{0,14}$/);
const schema = z.object({ studentId: idSchema, courseId: idSchema.optional(), message: z.string().trim().min(1).max(500) });

export async function POST(request: Request) {
  const auth = await requireOracleTeacher();
  if (auth.response) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "The guidance alert data is invalid." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Provide a student, course, and guidance message." }, { status: 400 });
  try {
    return await withOracleConnection(async (connection) => {
      const enrollment = await connection.execute<{ studentId: number; courseId: number }>(
        `SELECT e.student_id AS "studentId", e.course_id AS "courseId"
         FROM enrollments e JOIN courses c ON c.course_id = e.course_id
         WHERE e.student_id = :studentId AND c.teacher_id = :teacherId
           AND (:courseId IS NULL OR e.course_id = :courseId)
         ORDER BY CASE WHEN e.course_id = :courseId THEN 0 ELSE 1 END
         FETCH FIRST 1 ROW ONLY`,
        { studentId: Number(parsed.data.studentId), teacherId: auth.teacher.oracleTeacherId, courseId: parsed.data.courseId ? Number(parsed.data.courseId) : null },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const row = enrollment.rows?.[0];
      if (!row) return Response.json({ error: "This student is not enrolled in one of your courses." }, { status: 403 });
      const result = await connection.execute(
        `INSERT INTO guidance_alerts (student_id, teacher_user_id, course_id, message, alert_status, sent_at)
         VALUES (:studentId, :teacherUserId, :courseId, :message, 'SENT', SYSTIMESTAMP)
         RETURNING alert_id INTO :alertId`,
        { studentId: row.studentId, teacherUserId: auth.teacher.oracleUserId, courseId: row.courseId, message: parsed.data.message, alertId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      );
      await connection.commit();
      const id = (result.outBinds as { alertId?: number[] } | undefined)?.alertId?.[0];
      return Response.json({ id: String(id ?? ""), status: "SENT" }, { status: 201 });
    });
  } catch (error) {
    logOracleFailure(error);
    return oracleErrorResponse(error);
  }
}
