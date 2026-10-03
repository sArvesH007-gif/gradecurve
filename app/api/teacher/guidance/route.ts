import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const schema = z.object({
  studentId: z.string().min(1),
  courseId: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(500),
});
const errorResponse = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Sign in to send a guidance alert.", 401);
  if (user.role !== "TEACHER")
    return errorResponse(
      "Only faculty accounts can send guidance alerts.",
      403,
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("The guidance alert data is invalid.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return errorResponse("Provide a student, course, and guidance message.");
  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!teacher) return errorResponse("Faculty profile was not found.", 404);
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      studentId: parsed.data.studentId,
      ...(parsed.data.courseId ? { courseId: parsed.data.courseId } : {}),
      course: { teacherId: teacher.id },
    },
    select: { studentId: true, courseId: true },
  });
  if (!enrollment)
    return errorResponse(
      "This student is not enrolled in one of your courses.",
      403,
    );
  const alert = await prisma.guidanceAlert.create({
    data: {
      studentId: enrollment.studentId,
      teacherId: user.id,
      courseId: enrollment.courseId,
      message: parsed.data.message,
      status: "SENT",
      sentAt: new Date(),
    },
    select: { id: true, status: true },
  });
  return NextResponse.json(alert, { status: 201 });
}
