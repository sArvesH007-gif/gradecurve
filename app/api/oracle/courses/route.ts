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
  code: z.string().trim().transform((value) => value.toUpperCase())
    .pipe(z.string().min(2).max(20).regex(/^[A-Z0-9-]+$/)),
  name: z.string().trim().min(2).max(160),
  semester: z.coerce.number().int().min(1).max(12),
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
      return Response.json({ error: "Invalid course data." }, { status: 400 });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Provide a valid course code, name, semester, and slot." }, { status: 400 });

    const courseId = await withOracleConnection(async (connection) => {
      const slot = await connection.execute<{ SLOT_ID: number }>(
        `SELECT slot_id FROM class_slots
         WHERE slot_id = :slotId AND teacher_id = :teacherId`,
        { slotId: parsed.data.slotId, teacherId: auth.teacher.oracleTeacherId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      if (!slot.rows?.length)
        throw Object.assign(new Error("The selected class slot is not assigned to this teacher."), { errorNum: 20006 });

      try {
        await connection.execute(
          `INSERT INTO courses (code, name, semester, teacher_id)
           VALUES (:code, :name, :semester, :teacherId)`,
          {
            code: parsed.data.code,
            name: parsed.data.name,
            semester: parsed.data.semester,
            teacherId: auth.teacher.oracleTeacherId,
          },
        );
        const inserted = await connection.execute<{ COURSE_ID: number }>(
          `SELECT course_id FROM courses WHERE code = :code AND teacher_id = :teacherId`,
          { code: parsed.data.code, teacherId: auth.teacher.oracleTeacherId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        const id = Number(inserted.rows?.[0]?.COURSE_ID);
        await connection.execute(
          `INSERT INTO course_slots (course_id, slot_id) VALUES (:courseId, :slotId)`,
          { courseId: id, slotId: parsed.data.slotId },
        );
        await connection.commit();
        return id;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });

    return Response.json({ id: courseId, message: "Oracle course created." }, { status: 201 });
  } catch (error) {
    logOracleFailure(error);
    return error && typeof error === "object" && "errorNum" in error
      ? oracleErrorResponse(error)
      : oracleUnavailable();
  }
}
