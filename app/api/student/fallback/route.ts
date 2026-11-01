import oracledb from "oracledb";
import { z } from "zod";
import { detectOutlier } from "@/lib/grading";
import { isRawAssessmentScoreValid } from "@/lib/grading/assessment-components";
import { requireOracleStudent } from "@/lib/oracle/authorization";
import { logOracleFailure, oracleErrorResponse, withOracleConnection } from "@/lib/oracle/client";

export const runtime = "nodejs";
const idSchema = z.string().regex(/^[1-9]\d{0,14}$/);
const submissionSchema = z.object({
  courseId: idSchema,
  assessmentId: idSchema,
  score: z.coerce.number().finite().min(0),
  peerScores: z.union([z.string(), z.array(z.coerce.number().finite())]).optional(),
});

export async function POST(request: Request) {
  const auth = await requireOracleStudent();
  if (auth.response) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "The submission data is invalid." }, { status: 400 }); }
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Provide a course, assessment, and valid mark." }, { status: 400 });
  const rawPeers = parsed.data.peerScores;
  const peerScores = Array.isArray(rawPeers) ? rawPeers : (rawPeers ?? "").split(",").filter((value) => value.trim() !== "").map(Number);
  if (peerScores.length > 40 || peerScores.some((score) => !Number.isFinite(score)))
    return Response.json({ error: "Enter up to 40 valid peer marks." }, { status: 400 });

  try {
    return await withOracleConnection(async (connection) => {
      const studentId = auth.student.oracleStudentId;
      await connection.execute(`SELECT student_id FROM student_profiles WHERE student_id = :studentId FOR UPDATE`, { studentId });
      const assessmentResult = await connection.execute<{ maxScore: number }>(
        `SELECT a.max_score AS "maxScore" FROM enrollments e
         JOIN assessments a ON a.course_id = e.course_id
         WHERE e.student_id = :studentId AND e.course_id = :courseId AND a.assessment_id = :assessmentId`,
        { studentId, courseId: Number(parsed.data.courseId), assessmentId: Number(parsed.data.assessmentId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const assessment = assessmentResult.rows?.[0];
      if (!assessment) return Response.json({ error: "Choose an assessment from one of your enrolled courses." }, { status: 404 });
      if (!isRawAssessmentScoreValid(parsed.data.score, Number(assessment.maxScore)) || peerScores.some((score) => !isRawAssessmentScoreValid(score, Number(assessment.maxScore))))
        return Response.json({ error: `Raw marks must be between 0 and ${assessment.maxScore}.` }, { status: 400 });
      const pending = await connection.execute(
        `SELECT submission_id FROM mark_submissions WHERE student_id = :studentId AND assessment_id = :assessmentId AND submission_status = 'PENDING'`,
        { studentId, assessmentId: Number(parsed.data.assessmentId) },
      );
      if ((pending.rows?.length ?? 0) > 0) return Response.json({ error: "You already have a mark awaiting review for this assessment." }, { status: 409 });

      const isOutlier = detectOutlier(parsed.data.score, peerScores);
      const inserted = await connection.execute(
        `INSERT INTO mark_submissions (student_id, assessment_id, score, peer_scores_json, is_outlier, reason)
         VALUES (:studentId, :assessmentId, :score, :peerScores, :isOutlier, :reason)
         RETURNING submission_id INTO :submissionId`,
        {
          studentId, assessmentId: Number(parsed.data.assessmentId), score: parsed.data.score,
          peerScores: JSON.stringify(peerScores), isOutlier: isOutlier ? 1 : 0,
          reason: isOutlier ? "Reported mark differs from the submitted peer distribution by more than two standard deviations." : "Student reported a fallback mark; awaiting faculty verification.",
          submissionId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
      );
      await connection.commit();
      const id = (inserted.outBinds as { submissionId?: number[] } | undefined)?.submissionId?.[0];
      return Response.json({ id: String(id ?? ""), status: "PENDING", isOutlier }, { status: 201 });
    });
  } catch (error) {
    logOracleFailure(error);
    return oracleErrorResponse(error);
  }
}
