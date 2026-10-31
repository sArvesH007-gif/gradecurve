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
  assessmentId: z.coerce.number().int().positive(),
  score: z.coerce.number().finite().min(0),
});

export async function PUT(request: Request) {
  try {
    const auth = await requireOracleTeacher();
    if (auth.response) return auth.response;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid mark data." }, { status: 400 });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Provide a student, assessment, and non-negative raw score." }, { status: 400 });

    await withOracleConnection(async (connection) => {
      await connection.execute(
        `BEGIN upsert_assessment_mark(:teacherUserId, :studentId, :assessmentId, :score); END;`,
        {
          teacherUserId: auth.teacher.oracleUserId,
          ...parsed.data,
        },
      );
      await connection.commit();
    });
    return Response.json({ ok: true, message: "Oracle mark saved." });
  } catch (error) {
    logOracleFailure(error);
    return error && typeof error === "object" && "errorNum" in error
      ? oracleErrorResponse(error)
      : oracleUnavailable();
  }
}
