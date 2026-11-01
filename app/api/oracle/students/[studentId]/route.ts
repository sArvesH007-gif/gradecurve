import { z } from "zod";
import { requireOracleTeacher } from "@/lib/oracle/authorization";
import {
  logOracleFailure,
  oracleErrorResponse,
  oracleUnavailable,
  withOracleConnection,
} from "@/lib/oracle/client";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ studentId: string }> },
) {
  try {
    const auth = await requireOracleTeacher();
    if (auth.response) return auth.response;
    const { studentId: rawStudentId } = await context.params;
    const parsedId = z.coerce.number().int().positive().safeParse(rawStudentId);
    if (!parsedId.success)
      return Response.json({ error: "Provide a valid student ID." }, { status: 400 });

    await withOracleConnection(async (connection) => {
      await connection.execute(
        `BEGIN gradecurve_academic_pkg.remove_empty_student(:teacherUserId, :studentId); END;`,
        { teacherUserId: auth.teacher.oracleUserId, studentId: parsedId.data },
      );
      await connection.commit();
    });
    return Response.json({ ok: true, message: "Empty Oracle student record deleted." });
  } catch (error) {
    logOracleFailure(error);
    return error && typeof error === "object" && "errorNum" in error
      ? oracleErrorResponse(error)
      : oracleUnavailable();
  }
}
