import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

type StudentAssessmentSummaryRow = {
  registration_no: string;
  course_id: string;
  course_code: string;
  course_name: string;
  class_slot: string;
  assessment_id: string;
  assessment_name: string;
  obtained_marks: number | null;
  maximum_marks: number;
  weight: number;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in to view assessment data." },
      { status: 401 },
    );
  if (user.role !== "STUDENT")
    return NextResponse.json(
      { error: "Student access is required." },
      { status: 403 },
    );

  const rows = await prisma.$queryRaw<StudentAssessmentSummaryRow[]>`
    SELECT *
    FROM public.student_assessment_summary(${user.id})
  `;

  return NextResponse.json({ assessments: rows });
}
