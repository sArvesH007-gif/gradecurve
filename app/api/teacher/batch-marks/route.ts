import oracledb from "oracledb";
import { z } from "zod";
import { isRawAssessmentScoreValid } from "@/lib/grading/assessment-components";
import { requireOracleTeacher } from "@/lib/oracle/authorization";
import { logOracleFailure, oracleErrorResponse, withOracleConnection } from "@/lib/oracle/client";

export const runtime = "nodejs";
const idSchema = z.string().regex(/^[1-9]\d{0,14}$/);
const schema = z.object({
  courseId: idSchema,
  slotId: idSchema,
  assessmentId: idSchema,
  marks: z.array(z.object({ studentId: idSchema, score: z.coerce.number().finite().min(0) })).min(1).max(100),
});

export async function POST(request: Request) {
  const auth = await requireOracleTeacher();
  if (auth.response) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "The mark data is invalid." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Provide a course, slot, assessment, and at least one mark." }, { status: 400 });
  const marks = parsed.data.marks;
  const ids = marks.map(({ studentId }) => Number(studentId));
  if (new Set(ids).size !== ids.length) return Response.json({ error: "A student may only appear once in a batch." }, { status: 400 });
  try {
    return await withOracleConnection(async (connection) => {
      const { oracleUserId } = auth.teacher;
      const courseId = Number(parsed.data.courseId);
      const slotId = Number(parsed.data.slotId);
      const assessmentId = Number(parsed.data.assessmentId);
      const [course, offering, assessment] = await Promise.all([
        connection.execute(`SELECT course_id FROM courses WHERE course_id = :courseId AND teacher_id = (SELECT teacher_id FROM teacher_profiles WHERE user_id = :userId)`, { courseId, userId: oracleUserId }),
        connection.execute(`SELECT course_slot_id FROM course_slots WHERE course_id = :courseId AND slot_id = :slotId`, { courseId, slotId }),
        connection.execute<{ maxScore: number }>(`SELECT max_score AS "maxScore" FROM assessments WHERE course_id = :courseId AND assessment_id = :assessmentId`, { courseId, assessmentId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      ]);
      const maxScore = assessment.rows?.[0]?.maxScore;
      if (!course.rows?.length || !offering.rows?.length || maxScore == null) return Response.json({ error: "The selected course, slot, or assessment is not assigned to you." }, { status: 403 });
      if (marks.some(({ score }) => !isRawAssessmentScoreValid(score, Number(maxScore)))) return Response.json({ error: `Raw marks must be between 0 and ${maxScore}.` }, { status: 400 });
      const idBinds = Object.fromEntries(ids.map((id, index) => [`student${index}`, id]));
      const placeholders = ids.map((_, index) => `:student${index}`).join(", ");
      const enrolled = await connection.execute<{ studentId: number }>(
        `SELECT student_id AS "studentId" FROM enrollments WHERE course_id = :courseId AND slot_id = :slotId AND student_id IN (${placeholders})`,
        { courseId, slotId, ...idBinds }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      if ((enrolled.rows?.length ?? 0) !== ids.length) return Response.json({ error: "Every student must be enrolled in the selected course and slot." }, { status: 403 });
      try {
        for (const { studentId, score } of marks) {
          await connection.execute(
            `BEGIN upsert_assessment_mark(:teacherUserId, :studentId, :assessmentId, :score); END;`,
            { teacherUserId: oracleUserId, studentId: Number(studentId), assessmentId, score },
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
      return Response.json({ saved: ids.length });
    });
  } catch (error) {
    logOracleFailure(error);
    return oracleErrorResponse(error);
  }
}
