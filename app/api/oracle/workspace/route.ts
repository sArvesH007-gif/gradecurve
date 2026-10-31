import { requireOracleTeacher } from "@/lib/oracle/authorization";
import oracledb from "oracledb";
import {
  logOracleFailure,
  oracleUnavailable,
  withOracleConnection,
} from "@/lib/oracle/client";

export const runtime = "nodejs";

type Row = Record<string, number | string | Date | null>;

export async function GET() {
  try {
    const auth = await requireOracleTeacher();
    if (auth.response) return auth.response;
    const { oracleTeacherId } = auth.teacher;

    const data = await withOracleConnection(async (connection) => {
      const coursesResult = await connection.execute<Row>(
        `SELECT c.course_id AS "id", c.code AS "code", c.name AS "name",
          c.semester AS "semester",
          (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.course_id) AS "enrollmentCount"
         FROM courses c WHERE c.teacher_id = :teacherId ORDER BY c.code`,
        { teacherId: oracleTeacherId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const slotsResult = await connection.execute<Row>(
        `SELECT slot_id AS "id", name AS "name"
         FROM class_slots WHERE teacher_id = :teacherId ORDER BY name`,
        { teacherId: oracleTeacherId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const studentsResult = await connection.execute<Row>(
        `SELECT sp.student_id AS "id", sp.registration_no AS "registrationNo",
                u.full_name AS "name", sl.name AS "slotName"
         FROM student_profiles sp
         JOIN users u ON u.user_id = sp.user_id
         JOIN class_slots sl ON sl.slot_id = sp.active_slot_id
         WHERE EXISTS (
           SELECT 1 FROM enrollments e JOIN courses c ON c.course_id = e.course_id
           WHERE e.student_id = sp.student_id AND c.teacher_id = :teacherId
         )
         ORDER BY sp.registration_no`,
        { teacherId: oracleTeacherId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const assessmentsResult = await connection.execute<Row>(
        `SELECT a.assessment_id AS "id", a.course_id AS "courseId", a.name AS "name",
                a.max_score AS "maxScore", a.weight AS "weight", c.code AS "courseCode"
         FROM assessments a JOIN courses c ON c.course_id = a.course_id
         WHERE c.teacher_id = :teacherId ORDER BY c.code, a.name`,
        { teacherId: oracleTeacherId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const marksResult = await connection.execute<Row>(
        `SELECT m.mark_id AS "id", m.student_id AS "studentId",
                m.assessment_id AS "assessmentId", a.course_id AS "courseId",
                sp.registration_no AS "registrationNo", u.full_name AS "studentName",
                c.code AS "courseCode", a.name AS "assessmentName",
                m.score AS "score", a.max_score AS "maxScore"
         FROM marks m
         JOIN student_profiles sp ON sp.student_id = m.student_id
         JOIN users u ON u.user_id = sp.user_id
         JOIN assessments a ON a.assessment_id = m.assessment_id
         JOIN courses c ON c.course_id = a.course_id
         WHERE c.teacher_id = :teacherId
         ORDER BY c.code, sp.registration_no, a.name`,
        { teacherId: oracleTeacherId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      return {
        courses: coursesResult.rows ?? [],
        slots: slotsResult.rows ?? [],
        students: studentsResult.rows ?? [],
        assessments: assessmentsResult.rows ?? [],
        marks: marksResult.rows ?? [],
      };
    });

    return Response.json(data);
  } catch (error) {
    logOracleFailure(error);
    return oracleUnavailable();
  }
}
