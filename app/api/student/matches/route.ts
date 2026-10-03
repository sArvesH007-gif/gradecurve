import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { cumulativeStudentZScore } from "@/lib/grading/course-analytics";
import { prisma } from "@/lib/db/prisma";

const matchSchema = z.object({
  courseId: z.string().min(1),
  peerId: z.string().min(1),
});
const errorResponse = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Sign in to request a study match.", 401);
  if (user.role !== "STUDENT")
    return errorResponse(
      "Only student accounts can request study matches.",
      403,
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("The request data is invalid.");
  }
  const parsed = matchSchema.safeParse(body);
  if (!parsed.success) return errorResponse("Choose a valid study partner.");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) return errorResponse("Student profile was not found.", 404);
  if (parsed.data.peerId === profile.id)
    return errorResponse("Choose another student as your study partner.");

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: profile.id, courseId: parsed.data.courseId },
    include: { course: { include: { assessments: true } } },
  });
  if (!enrollment)
    return errorResponse("You are not enrolled in this course.", 404);

  const classmates = await prisma.enrollment.findMany({
    where: { courseId: enrollment.courseId, slotId: profile.activeSlotId },
    include: {
      student: {
        select: {
          id: true,
          marks: {
            where: { assessment: { courseId: enrollment.courseId } },
            select: { assessmentId: true, score: true },
          },
        },
      },
    },
  });
  const assessments = enrollment.course.assessments;
  const students = classmates.map(({ student }) => ({
    studentId: student.id,
    scores: Object.fromEntries(
      student.marks.map(({ assessmentId, score }) => [assessmentId, score]),
    ),
  }));
  const requester = students.find(({ studentId }) => studentId === profile.id);
  const peer = students.find(
    ({ studentId }) => studentId === parsed.data.peerId,
  );
  if (!requester || !peer)
    return errorResponse(
      "Study partners must be enrolled in the same course and active slot.",
      403,
    );

  const completedIds = assessments
    .filter(({ id }) => requester.scores[id] != null)
    .map(({ id }) => id);
  if (
    !completedIds.length ||
    !completedIds.every((id) => peer.scores[id] != null)
  )
    return errorResponse(
      "There is not enough shared course data to confirm this study match.",
      422,
    );
  const requesterZ = cumulativeStudentZScore(
    assessments,
    students,
    requester.studentId,
    completedIds,
  );
  if (requesterZ == null || requesterZ >= 0)
    return errorResponse(
      "Study matches are available when you are below the current course average.",
      422,
    );
  const peerZ = cumulativeStudentZScore(
    assessments,
    students,
    peer.studentId,
    completedIds,
  );
  if (peerZ == null || peerZ < 1.2)
    return errorResponse(
      "This student does not currently meet the +1.2σ study match threshold.",
      422,
    );

  try {
    const match = await prisma.studyMatch.create({
      data: {
        requesterId: profile.id,
        peerId: peer.studentId,
        courseId: enrollment.courseId,
      },
      select: { id: true, status: true },
    });
    return NextResponse.json(match, { status: 201 });
  } catch {
    return errorResponse(
      "A study match request already exists for this course.",
      409,
    );
  }
}
