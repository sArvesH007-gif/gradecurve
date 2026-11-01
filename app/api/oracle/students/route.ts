import { z } from "zod";
import oracledb from "oracledb";
import { hashPassword } from "@/lib/auth/password";
import { requireOracleTeacher } from "@/lib/oracle/authorization";
import {
  logOracleFailure,
  oracleErrorResponse,
  oracleUnavailable,
  withOracleConnection,
} from "@/lib/oracle/client";

export const runtime = "nodejs";

const schema = z.object({
  registrationNo: z.string().trim().transform((value) => value.toUpperCase())
    .pipe(z.string().min(4).max(24).regex(/^[A-Z0-9-]+$/)),
  name: z.string().trim().min(2).max(160),
  initialPassword: z.string().min(12).max(256),
  courseId: z.coerce.number().int().positive(),
  slotId: z.coerce.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireOracleTeacher();
    if (auth.response) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid student data." }, { status: 400 });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return Response.json(
        { error: "Provide a valid registration number, name, initial password, course, and slot." },
        { status: 400 },
      );

    const studentId = await withOracleConnection(async (connection) => {
      try {
        const offering = await connection.execute<{ courseId: number; semester: number }>(
          `SELECT c.course_id AS "courseId", c.semester AS "semester"
           FROM courses c
           JOIN course_slots cs ON cs.course_id = c.course_id
           JOIN class_slots sl ON sl.slot_id = cs.slot_id
           WHERE c.course_id = :courseId AND sl.slot_id = :slotId
             AND c.teacher_id = :teacherId AND sl.teacher_id = :teacherId`,
          {
            courseId: parsed.data.courseId,
            slotId: parsed.data.slotId,
            teacherId: auth.teacher.oracleTeacherId,
          },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        const course = offering.rows?.[0];
        if (!course)
          throw Object.assign(new Error("The selected course and slot are not assigned to this teacher."), { errorNum: 20006 });

        await connection.execute(
          `INSERT INTO users (username, full_name, password_hash, user_role)
           VALUES (:username, :name, :passwordHash, 'STUDENT')`,
          {
            username: parsed.data.registrationNo,
            name: parsed.data.name,
            passwordHash: hashPassword(parsed.data.initialPassword),
          },
        );
        const userResult = await connection.execute<{ userId: number }>(
          `SELECT user_id AS "userId" FROM users WHERE username = :username`,
          { username: parsed.data.registrationNo },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        const userId = Number(userResult.rows?.[0]?.userId);
        await connection.execute(
          `INSERT INTO student_profiles (user_id, registration_no, semester, active_slot_id)
           VALUES (:userId, :registrationNo, :semester, :slotId)`,
          {
            userId,
            registrationNo: parsed.data.registrationNo,
            semester: Number(course.semester),
            slotId: parsed.data.slotId,
          },
        );
        const profileResult = await connection.execute<{ studentId: number }>(
          `SELECT student_id AS "studentId" FROM student_profiles WHERE user_id = :userId`,
          { userId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        const id = Number(profileResult.rows?.[0]?.studentId);
        await connection.execute(
          `INSERT INTO enrollments (student_id, course_id, slot_id)
           VALUES (:studentId, :courseId, :slotId)`,
          { studentId: id, courseId: parsed.data.courseId, slotId: parsed.data.slotId },
        );
        await connection.commit();
        return id;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });

    return Response.json({ id: studentId, message: "Oracle student created." }, { status: 201 });
  } catch (error) {
    logOracleFailure(error);
    return error && typeof error === "object" && "errorNum" in error
      ? oracleErrorResponse(error)
      : oracleUnavailable();
  }
}
