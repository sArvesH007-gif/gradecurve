import oracledb from "oracledb";
import { z } from "zod";
import { requireOracleTeacher } from "@/lib/oracle/authorization";
import { logOracleFailure, oracleErrorResponse, withOracleConnection } from "@/lib/oracle/client";

export const runtime = "nodejs";
const idSchema = z.string().regex(/^[1-9]\d{0,14}$/);

export async function GET(request: Request) {
  const auth = await requireOracleTeacher();
  if (auth.response) return auth.response;
  const courseId = new URL(request.url).searchParams.get("courseId");
  if (!courseId || !idSchema.safeParse(courseId).success) return Response.json({ error: "Provide a course ID." }, { status: 400 });
  try {
    const assessments = await withOracleConnection(async (connection) => {
      const owned = await connection.execute(
        `SELECT course_id FROM courses WHERE course_id = :courseId AND teacher_id = :teacherId`,
        { courseId: Number(courseId), teacherId: auth.teacher.oracleTeacherId },
      );
      if (!owned.rows?.length) return null;
      const result = await connection.execute(
        `SELECT a.assessment_id AS "assessment_id", a.name AS "assessment_name",
                a.max_score AS "maximum_marks", COUNT(m.mark_id) AS "student_count",
                AVG(m.score) AS "mean_score", NVL(STDDEV_POP(m.score), 0) AS "standard_deviation",
                MIN(m.score) AS "minimum_score", MAX(m.score) AS "maximum_score"
         FROM assessments a LEFT JOIN marks m ON m.assessment_id = a.assessment_id
         WHERE a.course_id = :courseId
         GROUP BY a.assessment_id, a.name, a.max_score
         ORDER BY a.name`,
        { courseId: Number(courseId) }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return result.rows ?? [];
    });
    if (!assessments) return Response.json({ error: "Course was not found for this teacher." }, { status: 404 });
    return Response.json({ assessments });
  } catch (error) {
    logOracleFailure(error);
    return oracleErrorResponse(error);
  }
}
