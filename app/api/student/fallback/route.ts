import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { detectOutlier } from "@/lib/grading";
import { isRawAssessmentScoreValid } from "@/lib/grading/assessment-components";
import { prisma } from "@/lib/db/prisma";

const submissionSchema = z.object({
  courseId: z.string().min(1),
  assessmentId: z.string().min(1),
  score: z.coerce.number().finite().min(0),
  peerScores: z
    .union([z.string(), z.array(z.coerce.number().finite())])
    .optional(),
});

function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return badRequest("Sign in to submit a mark.", 401);
  if (user.role !== "STUDENT")
    return badRequest("Only student accounts can submit fallback marks.", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("The submission data is invalid.");
  }
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success)
    return badRequest("Provide a course, assessment, and valid mark.");

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile) return badRequest("Student profile was not found.", 404);
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: profile.id, courseId: parsed.data.courseId },
    include: {
      course: {
        include: {
          assessments: {
            where: { id: parsed.data.assessmentId },
            select: { id: true, maxScore: true },
          },
        },
      },
    },
  });
  const assessment = enrollment?.course.assessments[0];
  if (!assessment)
    return badRequest(
      "Choose an assessment from one of your enrolled courses.",
      404,
    );
  if (!isRawAssessmentScoreValid(parsed.data.score, assessment.maxScore))
    return badRequest(
      `Raw mark must be between 0 and ${assessment.maxScore}.`,
    );

  const rawPeers = parsed.data.peerScores;
  const peerScores = Array.isArray(rawPeers)
    ? rawPeers
    : (rawPeers ?? "")
        .split(",")
        .filter((value) => value.trim() !== "")
        .map(Number);
  if (
    peerScores.length > 40 ||
    peerScores.some(
      (score) =>
        !isRawAssessmentScoreValid(score, assessment.maxScore),
    )
  ) {
    return badRequest(
      `Enter up to 40 raw peer marks between 0 and ${assessment.maxScore}.`,
    );
  }

  const isOutlier = detectOutlier(parsed.data.score, peerScores);
  const existing = await prisma.markSubmission.findFirst({
    where: {
      studentId: profile.id,
      assessmentId: assessment.id,
      status: "PENDING",
    },
  });
  if (existing)
    return badRequest(
      "You already have a mark awaiting review for this assessment.",
      409,
    );

  const submission = await prisma.markSubmission.create({
    data: {
      studentId: profile.id,
      assessmentId: assessment.id,
      score: parsed.data.score,
      peerScores,
      isOutlier,
      reason: isOutlier
        ? "Reported mark differs from the submitted peer distribution by more than two standard deviations."
        : "Student reported a fallback mark; awaiting faculty verification.",
    },
    select: { id: true, status: true, isOutlier: true },
  });
  return NextResponse.json(submission, { status: 201 });
}
