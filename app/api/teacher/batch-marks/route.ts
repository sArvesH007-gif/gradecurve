import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isRawAssessmentScoreValid } from "@/lib/grading/assessment-components";
import { prisma } from "@/lib/db/prisma";

const schema = z.object({
  courseId: z.string().min(1),
  slotId: z.string().min(1),
  assessmentId: z.string().min(1),
  marks: z
    .array(
      z.object({
        studentId: z.string().min(1),
        score: z.coerce.number().finite().min(0),
      }),
    )
    .min(1)
    .max(100),
});
const errorResponse = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Sign in to enter marks.", 401);
  if (user.role !== "TEACHER")
    return errorResponse("Only faculty accounts can enter marks.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("The mark data is invalid.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return errorResponse(
      "Provide a course, slot, assessment, and at least one mark.",
    );

  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!teacher) return errorResponse("Faculty profile was not found.", 404);
  const [course, offering, assessment] = await Promise.all([
    prisma.course.findFirst({
      where: { id: parsed.data.courseId, teacherId: teacher.id },
      select: { id: true },
    }),
    prisma.courseSlot.findUnique({
      where: {
        courseId_slotId: {
          courseId: parsed.data.courseId,
          slotId: parsed.data.slotId,
        },
      },
    }),
    prisma.assessment.findFirst({
      where: { id: parsed.data.assessmentId, courseId: parsed.data.courseId },
    }),
  ]);
  if (!course || !offering || !assessment)
    return errorResponse(
      "The selected course, slot, or assessment is not assigned to you.",
      403,
    );
  if (
    parsed.data.marks.some(
      ({ score }) => !isRawAssessmentScoreValid(score, assessment.maxScore),
    )
  )
    return errorResponse(
      `Raw marks must be between 0 and ${assessment.maxScore}.`,
    );
  const ids = parsed.data.marks.map(({ studentId }) => studentId);
  if (new Set(ids).size !== ids.length)
    return errorResponse("A student may only appear once in a batch.");
  const enrolled = await prisma.enrollment.findMany({
    where: {
      studentId: { in: ids },
      courseId: course.id,
      slotId: parsed.data.slotId,
    },
    select: { studentId: true },
  });
  if (enrolled.length !== ids.length)
    return errorResponse(
      "Every student must be enrolled in the selected course and slot.",
      403,
    );

  await prisma.$transaction(
    parsed.data.marks.map(({ studentId, score }) =>
      prisma.mark.upsert({
        where: {
          studentId_assessmentId: { studentId, assessmentId: assessment.id },
        },
        create: {
          studentId,
          assessmentId: assessment.id,
          score,
          enteredById: user.id,
          source: "FACULTY",
        },
        update: { score, enteredById: user.id, source: "FACULTY" },
      }),
    ),
  );
  return NextResponse.json({ saved: ids.length });
}
