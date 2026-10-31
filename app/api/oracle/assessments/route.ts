import { z } from "zod";
import oracledb from "oracledb";
import { requireOracleTeacher } from "@/lib/oracle/authorization";
import {
  logOracleFailure,
  oracleErrorResponse,
  oracleUnavailable,
  withOracleConnection,
} from "@/lib/oracle/client";

export const runtime = "nodejs";

const schema = z.object({
  courseId: z.coerce.number().int().positive(),
  name: z.string().trim().transform((value) => value.toUpperCase())
    .pipe(z.string().min(2).max(24).regex(/^[A-Z0-9_-]+$/)),
  maxScore: z.coerce.number().finite().positive().max(10000),
  weight: z.coerce.number().finite().positive().max(1),
});

export async function POST(request: Request) {
  try {
    const auth = await requireOracleTeacher();
    if (auth.response) return auth.response;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid assessment data." }, { status: 400 });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Provide an assessment name, maximum raw mark, and weight between 0 and 1." }, { status: 400 });

    const assessmentId = await withOracleConnection(async (connection) => {
      const course = await connection.execute<{ COURSE_ID: number }>(
        `SELECT course_id FROM courses WHERE course_id = :courseId AND teacher_id = :teacherId`,
        { courseId: parsed.data.courseId, teacherId: auth.teacher.oracleTeacherId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      if (!course.rows?.length)
        throw Object.assign(new Error("Course is not assigned to this teacher."), { errorNum: 20009 });

      const totals = await connection.execute<{ TOTAL_WEIGHT: number }>(
        `SELECT NVL(SUM(weight), 0) AS total_weight FROM assessments WHERE course_id = :courseId`,
        { courseId: parsed.data.courseId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      if (Number(totals.rows?.[0]?.TOTAL_WEIGHT ?? 0) + parsed.data.weight > 1.000001)
        throw Object.assign(new Error("Assessment weight would exceed the course's 100 percent total."), { errorNum: 20013 });

      try {
        await connection.execute(
          `INSERT INTO assessments (course_id, name, max_score, weight)
           VALUES (:courseId, :name, :maxScore, :weight)`,
          parsed.data,
        );
        const created = await connection.execute<{ ASSESSMENT_ID: number }>(
          `SELECT assessment_id FROM assessments WHERE course_id = :courseId AND name = :name`,
          { courseId: parsed.data.courseId, name: parsed.data.name },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        await connection.commit();
        return Number(created.rows?.[0]?.ASSESSMENT_ID);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
    return Response.json({ id: assessmentId, message: "Oracle assessment created." }, { status: 201 });
  } catch (error) {
    logOracleFailure(error);
    return error && typeof error === "object" && "errorNum" in error
      ? oracleErrorResponse(error)
      : oracleUnavailable();
  }
}
