import oracledb from "oracledb";
import { z } from "zod";
import { cumulativeStudentZScore } from "@/lib/grading/course-analytics";
import { requireOracleStudent } from "@/lib/oracle/authorization";
import { logOracleFailure, oracleErrorResponse, withOracleConnection } from "@/lib/oracle/client";

export const runtime = "nodejs";
const idSchema = z.string().regex(/^[1-9]\d{0,14}$/);
const matchSchema = z.object({ courseId: idSchema, peerId: idSchema });

export async function POST(request: Request) {
  const auth = await requireOracleStudent();
  if (auth.response) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "The request data is invalid." }, { status: 400 }); }
  const parsed = matchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose a valid study partner." }, { status: 400 });
  const studentId = auth.student.oracleStudentId;
  const peerId = Number(parsed.data.peerId);
  const courseId = Number(parsed.data.courseId);
  if (peerId === studentId) return Response.json({ error: "Choose another student as your study partner." }, { status: 400 });

  try {
    return await withOracleConnection(async (connection) => {
      const enrollmentResult = await connection.execute<{ slotId: number }>(
        `SELECT slot_id AS "slotId" FROM enrollments WHERE student_id = :studentId AND course_id = :courseId`,
        { studentId, courseId }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const enrollment = enrollmentResult.rows?.[0];
      if (!enrollment) return Response.json({ error: "You are not enrolled in this course." }, { status: 404 });
      const scoreResult = await connection.execute<{ studentId: number; assessmentId: number; assessmentName: string; score: number | null; maxScore: number; weight: number }>(
        `SELECT e.student_id AS "studentId", a.assessment_id AS "assessmentId", a.name AS "assessmentName", m.score AS "score", a.max_score AS "maxScore", a.weight AS "weight"
         FROM enrollments e JOIN assessments a ON a.course_id = e.course_id
         LEFT JOIN marks m ON m.student_id = e.student_id AND m.assessment_id = a.assessment_id
         WHERE e.course_id = :courseId AND e.slot_id = :slotId ORDER BY e.student_id, a.assessment_id`,
        { courseId, slotId: enrollment.slotId }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const assessmentsById = new Map<string, { id: string; name: string; maxScore: number; weight: number }>();
      const studentsById = new Map<string, { studentId: string; scores: Record<string, number | undefined> }>();
      for (const row of scoreResult.rows ?? []) {
        const assessmentId = String(row.assessmentId);
        assessmentsById.set(assessmentId, { id: assessmentId, name: row.assessmentName, maxScore: Number(row.maxScore), weight: Number(row.weight) });
        const id = String(row.studentId);
        const student = studentsById.get(id) ?? { studentId: id, scores: {} };
        if (row.score != null) student.scores[assessmentId] = Number(row.score);
        studentsById.set(id, student);
      }
      const assessments = [...assessmentsById.values()];
      const students = [...studentsById.values()];
      const requester = students.find((student) => student.studentId === String(studentId));
      const peer = students.find((student) => student.studentId === String(peerId));
      if (!requester || !peer) return Response.json({ error: "Study partners must be enrolled in the same course and active slot." }, { status: 403 });
      const completedIds = assessments.filter(({ id }) => requester.scores[id] != null).map(({ id }) => id);
      if (!completedIds.length || !completedIds.every((id) => peer.scores[id] != null)) return Response.json({ error: "There is not enough shared course data to confirm this study match." }, { status: 422 });
      const requesterZ = cumulativeStudentZScore(assessments, students, requester.studentId, completedIds);
      if (requesterZ == null || requesterZ >= 0) return Response.json({ error: "Study matches are available when you are below the current course average." }, { status: 422 });
      const peerZ = cumulativeStudentZScore(assessments, students, peer.studentId, completedIds);
      if (peerZ == null || peerZ < 1.2) return Response.json({ error: "This student does not currently meet the +1.2σ study match threshold." }, { status: 422 });
      const inserted = await connection.execute(
        `INSERT INTO study_matches (requester_id, peer_id, course_id)
         VALUES (:requesterId, :peerId, :courseId)
         RETURNING study_match_id INTO :matchId`,
        { requesterId: studentId, peerId, courseId, matchId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      );
      await connection.commit();
      const id = (inserted.outBinds as { matchId?: number[] } | undefined)?.matchId?.[0];
      return Response.json({ id: String(id ?? ""), status: "REQUESTED" }, { status: 201 });
    });
  } catch (error) {
    logOracleFailure(error);
    const errorNum = typeof error === "object" && error !== null && "errorNum" in error ? Number(error.errorNum) : 0;
    if (errorNum === 1) return Response.json({ error: "A study match request already exists for this course." }, { status: 409 });
    return oracleErrorResponse(error);
  }
}
