import { z } from "zod";
import { requireOracleTeacher } from "@/lib/oracle/authorization";
import {
  logOracleFailure,
  oracleErrorResponse,
  oracleUnavailable,
  withOracleConnection,
} from "@/lib/oracle/client";

export const runtime = "nodejs";

const schema = z.object({
  studentId: z.coerce.number().int().positive(),
  courseId: z.coerce.number().int().positive(),
  attendanceDate: z.iso.date(),
  present: z.coerce.number().int().min(0).max(1),
});

export async function PUT(request: Request) {
  try {
    const auth = await requireOracleTeacher();
    if (auth.response) return auth.response;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid attendance data." }, { status: 400 });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Provide a student, course, date, and attendance status." }, { status: 400 });

    await withOracleConnection(async (connection) => {
      await connection.execute(
        `BEGIN record_course_attendance(:teacherUserId, :studentId, :courseId,
                                        TO_DATE(:attendanceDate, 'YYYY-MM-DD'), :present); END;`,
        {
          teacherUserId: auth.teacher.oracleUserId,
          ...parsed.data,
        },
      );
      await connection.commit();
    });
    return Response.json({ ok: true, message: "Oracle attendance saved." });
  } catch (error) {
    logOracleFailure(error);
    return error && typeof error === "object" && "errorNum" in error
      ? oracleErrorResponse(error)
      : oracleUnavailable();
  }
}
