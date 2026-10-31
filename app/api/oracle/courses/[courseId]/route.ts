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
  context: { params: Promise<{ courseId: string }> },
) {
  try {
    const auth = await requireOracleTeacher();
    if (auth.response) return auth.response;
    const { courseId: rawCourseId } = await context.params;
    const parsedId = z.coerce.number().int().positive().safeParse(rawCourseId);
    if (!parsedId.success)
      return Response.json({ error: "Provide a valid course ID." }, { status: 400 });

    await withOracleConnection(async (connection) => {
      await connection.execute(
        `BEGIN delete_empty_course(:teacherUserId, :courseId); END;`,
        { teacherUserId: auth.teacher.oracleUserId, courseId: parsedId.data },
      );
      await connection.commit();
    });
    return Response.json({ ok: true, message: "Unused Oracle course deleted." });
  } catch (error) {
    logOracleFailure(error);
    return error && typeof error === "object" && "errorNum" in error
      ? oracleErrorResponse(error)
      : oracleUnavailable();
  }
}
