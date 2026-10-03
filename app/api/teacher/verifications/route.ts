import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isRawAssessmentScoreValid } from "@/lib/grading/assessment-components";
import { prisma } from "@/lib/db/prisma";

const schema = z.object({
  submissionId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  overrideScore: z.union([z.number().finite().min(0), z.null()]).optional(),
  note: z.string().trim().max(500).optional(),
});
const errorResponse = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Sign in to verify marks.", 401);
  if (user.role !== "TEACHER")
    return errorResponse("Only faculty accounts can verify marks.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("The verification data is invalid.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return errorResponse("Choose an approval decision.");

  const submission = await prisma.markSubmission.findUnique({
    where: { id: parsed.data.submissionId },
    include: { assessment: { include: { course: true } } },
  });
  if (!submission || submission.status !== "PENDING")
    return errorResponse("This submission is no longer awaiting review.", 404);
  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!teacher || submission.assessment.course.teacherId !== teacher.id)
    return errorResponse(
      "This submission is outside your assigned courses.",
      403,
    );

  const score =
    parsed.data.decision === "APPROVED"
      ? submission.score
      : (parsed.data.overrideScore ?? null);
  if (
    score != null &&
    !isRawAssessmentScoreValid(score, submission.assessment.maxScore)
  )
    return errorResponse(
      `Override raw mark must be between 0 and ${submission.assessment.maxScore}.`,
    );
  const decision = parsed.data.decision;
  const note =
    parsed.data.note ||
    (decision === "APPROVED"
      ? "Fallback mark approved."
      : score == null
        ? "Fallback mark rejected."
        : "Fallback mark rejected; faculty override entered.");
  await prisma.$transaction(async (transaction) => {
    await transaction.markVerification.create({
      data: {
        submissionId: submission.id,
        reviewerId: user.id,
        decision,
        officialScore: score,
        note,
      },
    });
    await transaction.markSubmission.update({
      where: { id: submission.id },
      data: { status: decision },
    });
    if (score != null) {
      await transaction.mark.upsert({
        where: {
          studentId_assessmentId: {
            studentId: submission.studentId,
            assessmentId: submission.assessmentId,
          },
        },
        create: {
          studentId: submission.studentId,
          assessmentId: submission.assessmentId,
          score,
          enteredById: user.id,
          source: decision === "APPROVED" ? "APPROVED_FALLBACK" : "FACULTY",
        },
        update: {
          score,
          enteredById: user.id,
          source: decision === "APPROVED" ? "APPROVED_FALLBACK" : "FACULTY",
        },
      });
    }
  });
  return NextResponse.json({ ok: true, decision, officialScore: score });
}
