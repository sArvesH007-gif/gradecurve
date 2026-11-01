import oracledb from "oracledb";
import { z } from "zod";
import { isRawAssessmentScoreValid } from "@/lib/grading/assessment-components";
import { requireOracleTeacher } from "@/lib/oracle/authorization";
import { logOracleFailure, oracleErrorResponse, withOracleConnection } from "@/lib/oracle/client";

export const runtime = "nodejs";
const schema = z.object({
  submissionId: z.string().regex(/^[1-9]\d{0,14}$/),
  decision: z.enum(["APPROVED", "REJECTED"]),
  overrideScore: z.union([z.number().finite().min(0), z.null()]).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const auth = await requireOracleTeacher();
  if (auth.response) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "The verification data is invalid." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose an approval decision." }, { status: 400 });
  try {
    return await withOracleConnection(async (connection) => {
      const submissionResult = await connection.execute<{
        id: number; studentId: number; assessmentId: number; score: number; status: string; maxScore: number; teacherId: number;
      }>(
        `SELECT ms.submission_id AS "id", ms.student_id AS "studentId", ms.assessment_id AS "assessmentId",
                ms.score AS "score", ms.submission_status AS "status", a.max_score AS "maxScore", c.teacher_id AS "teacherId"
         FROM mark_submissions ms JOIN assessments a ON a.assessment_id = ms.assessment_id
         JOIN courses c ON c.course_id = a.course_id
         WHERE ms.submission_id = :submissionId FOR UPDATE OF ms.submission_status`,
        { submissionId: Number(parsed.data.submissionId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const submission = submissionResult.rows?.[0];
      if (!submission || submission.status !== "PENDING") return Response.json({ error: "This submission is no longer awaiting review." }, { status: 404 });
      if (Number(submission.teacherId) !== auth.teacher.oracleTeacherId) return Response.json({ error: "This submission is outside your assigned courses." }, { status: 403 });
      const score = parsed.data.decision === "APPROVED" ? Number(submission.score) : (parsed.data.overrideScore ?? null);
      if (score != null && !isRawAssessmentScoreValid(score, Number(submission.maxScore))) return Response.json({ error: `Override raw mark must be between 0 and ${submission.maxScore}.` }, { status: 400 });
      const decision = parsed.data.decision;
      const note = parsed.data.note || (decision === "APPROVED" ? "Fallback mark approved." : score == null ? "Fallback mark rejected." : "Fallback mark rejected; faculty override entered.");
      try {
        await connection.execute(
          `INSERT INTO mark_verifications (submission_id, reviewer_id, decision, official_score, note)
           VALUES (:submissionId, :reviewerId, :decision, :score, :note)`,
          { submissionId: submission.id, reviewerId: auth.teacher.oracleUserId, decision, score, note },
        );
        await connection.execute(
          `UPDATE mark_submissions SET submission_status = :decision, updated_at = SYSTIMESTAMP WHERE submission_id = :submissionId`,
          { decision, submissionId: submission.id },
        );
        if (score != null) {
          await connection.execute(
            `MERGE INTO marks target
             USING (SELECT :studentId AS student_id, :assessmentId AS assessment_id, :score AS score FROM dual) source
             ON (target.student_id = source.student_id AND target.assessment_id = source.assessment_id)
             WHEN MATCHED THEN UPDATE SET target.score = source.score, target.mark_source = :sourceName,
                                          target.entered_by_user_id = :reviewerId, target.updated_at = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT (student_id, assessment_id, score, mark_source, entered_by_user_id)
             VALUES (source.student_id, source.assessment_id, source.score, :sourceName, :reviewerId)`,
            { studentId: submission.studentId, assessmentId: submission.assessmentId, score,
              sourceName: decision === "APPROVED" ? "APPROVED_FALLBACK" : "FACULTY", reviewerId: auth.teacher.oracleUserId },
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
      return Response.json({ ok: true, decision, officialScore: score });
    });
  } catch (error) {
    logOracleFailure(error);
    return oracleErrorResponse(error);
  }
}
