import oracledb from "oracledb";
import { requireOracleStudent } from "@/lib/oracle/authorization";
import { logOracleFailure, oracleErrorResponse, withOracleConnection } from "@/lib/oracle/client";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireOracleStudent();
  if (auth.response) return auth.response;
  try {
    const result = await withOracleConnection((connection) =>
      connection.execute(
        `SELECT sp.registration_no AS "registration_no", c.course_id AS "course_id",
                c.code AS "course_code", c.name AS "course_name", sl.name AS "class_slot",
                a.assessment_id AS "assessment_id", a.name AS "assessment_name",
                m.score AS "obtained_marks", a.max_score AS "maximum_marks", a.weight AS "weight"
         FROM enrollments e
         JOIN student_profiles sp ON sp.student_id = e.student_id
         JOIN courses c ON c.course_id = e.course_id
         JOIN class_slots sl ON sl.slot_id = e.slot_id
         JOIN assessments a ON a.course_id = c.course_id
         LEFT JOIN marks m ON m.student_id = e.student_id AND m.assessment_id = a.assessment_id
         WHERE e.student_id = :studentId
         ORDER BY c.code, a.name`,
        { studentId: auth.student.oracleStudentId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ),
    );
    return Response.json({ assessments: result.rows ?? [] });
  } catch (error) {
    logOracleFailure(error);
    return oracleErrorResponse(error);
  }
}
