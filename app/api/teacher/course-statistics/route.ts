import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

type AssessmentStatisticsRow = {
  assessment_id: string;
  assessment_name: string;
  maximum_marks: number;
  student_count: bigint;
  mean_score: number | null;
  standard_deviation: number;
  minimum_score: number | null;
  maximum_score: number | null;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in to view course statistics." },
      { status: 401 },
    );
  if (user.role !== "TEACHER")
    return NextResponse.json(
      { error: "Teacher access is required." },
      { status: 403 },
    );

  const courseId = new URL(request.url).searchParams.get("courseId");
  if (!courseId)
    return NextResponse.json(
      { error: "Provide a course ID." },
      { status: 400 },
    );

  const course = await prisma.course.findFirst({
    where: { id: courseId, teacher: { userId: user.id } },
    select: { id: true },
  });
  if (!course)
    return NextResponse.json(
      { error: "Course was not found for this teacher." },
      { status: 404 },
    );

  const statistics = await prisma.$queryRaw<AssessmentStatisticsRow[]>`
    SELECT *
    FROM public.course_assessment_statistics(${course.id})
  `;
  return NextResponse.json({
    assessments: statistics.map((row) => ({
      ...row,
      student_count: Number(row.student_count),
    })),
  });
}
