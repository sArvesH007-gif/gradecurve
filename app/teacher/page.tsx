import Link from "next/link";
import { redirect } from "next/navigation";
import {
  TeacherWorkspace,
  type RiskItem,
  type TeacherCourseData,
  type VerificationItem,
} from "@/components/teacher/teacher-workspace";
import { getCurrentUser } from "@/lib/auth/session";
import { calculateMean, detectAtRiskStudent } from "@/lib/grading";
import {
  cumulativeStudentZScore,
  weightedCourseScore,
} from "@/lib/grading/course-analytics";
import { prisma } from "@/lib/db/prisma";

export default async function TeacherHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?role=teacher");
  if (user.role !== "TEACHER") redirect("/login?role=student&error=role");

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: user.id },
    include: {
      courses: {
        include: {
          assessments: { orderBy: { name: "asc" } },
          offerings: { include: { slot: true } },
        },
      },
    },
  });
  if (!profile) redirect("/login?role=teacher&error=1");

  const classResults = await Promise.all(
    profile.courses.map(async (course) => {
      const [enrollments, attendance] = await Promise.all([
        prisma.enrollment.findMany({
          where: { courseId: course.id },
          include: {
            slot: true,
            student: {
              select: {
                id: true,
                registrationNo: true,
                user: { select: { name: true } },
                marks: {
                  where: { assessment: { courseId: course.id } },
                  select: { assessmentId: true, score: true },
                },
              },
            },
          },
        }),
        prisma.attendance.findMany({
          where: { courseId: course.id },
          select: { studentId: true, present: true },
        }),
      ]);
      const roster = enrollments.map(({ student, slot }) => ({
        studentId: student.id,
        name: student.user.name,
        registrationNo: student.registrationNo,
        slotId: slot.id,
        slotName: slot.name,
        scores: Object.fromEntries(
          student.marks.map(({ assessmentId, score }) => [assessmentId, score]),
        ),
      }));
      const currentTotals = roster.map((student) =>
        weightedCourseScore(course.assessments, student.scores),
      );
      const slotIds = [...new Set(roster.map(({ slotId }) => slotId))];
      const risks: RiskItem[] = [];
      for (const slotId of slotIds) {
        const classmates = roster.filter(
          (student) => student.slotId === slotId,
        );
        for (const student of classmates) {
          const zScore = cumulativeStudentZScore(
            course.assessments,
            classmates,
            student.studentId,
          );
          const rows = attendance.filter(
            ({ studentId }) => studentId === student.studentId,
          );
          const attendancePercent = rows.length
            ? (rows.filter(({ present }) => present).length / rows.length) * 100
            : null;
          const risk = detectAtRiskStudent(zScore, attendancePercent);
          if (risk.atRisk)
            risks.push({
              studentId: student.studentId,
              studentName: student.name,
              registrationNo: student.registrationNo,
              courseId: course.id,
              courseCode: course.code,
              courseName: course.name,
              zScore,
              attendance: attendancePercent,
              reasons: risk.reasons,
            });
        }
      }
      const slots = course.offerings.map(({ slot }) => ({
        id: slot.id,
        name: slot.name,
        enrollmentCount: roster.filter(({ slotId }) => slotId === slot.id)
          .length,
      }));
      return {
        course: {
          id: course.id,
          code: course.code,
          name: course.name,
          average: calculateMean(currentTotals),
          enrollmentCount: roster.length,
          assessments: course.assessments.map(
            ({ id, name, maxScore, weight }) => ({
              id,
              name,
              maxScore,
              weight,
            }),
          ),
          slots,
          roster,
        } satisfies TeacherCourseData,
        risks,
      };
    }),
  );

  const pendingRows = await prisma.markSubmission.findMany({
    where: {
      status: "PENDING",
      assessment: { course: { teacherId: profile.id } },
    },
    select: {
      id: true,
      assessmentId: true,
      score: true,
      peerScores: true,
      isOutlier: true,
      createdAt: true,
      student: {
        select: {
          registrationNo: true,
          user: { select: { name: true } },
        },
      },
      assessment: {
        select: {
          courseId: true,
          name: true,
          maxScore: true,
          course: { select: { code: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const pending: VerificationItem[] = pendingRows.map((item) => ({
    id: item.id,
    studentName: item.student.user.name,
    registrationNo: item.student.registrationNo,
    courseId: item.assessment.courseId,
    courseCode: item.assessment.course.code,
    assessmentId: item.assessmentId,
    assessmentName: item.assessment.name,
    score: item.score,
    maxScore: item.assessment.maxScore,
    peerScores: item.peerScores,
    isOutlier: item.isOutlier,
    createdAt: item.createdAt.toISOString(),
  }));
  const atRisk = classResults.flatMap(({ risks }) => risks);
  const courses = classResults.map(({ course }) => course);

  return (
    <>
      <header className="mx-auto flex h-[68px] w-full max-w-7xl items-center justify-between border-b border-white/[0.08] px-5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-semibold tracking-tight"
        >
          <span className="from-violet to-cyan grid size-8 place-items-center rounded-lg bg-gradient-to-br text-sm text-white">
            g
          </span>
          GradeCurve
        </Link>
        <form action="/api/logout" method="post">
          <button
            className="text-muted hover:text-foreground text-sm transition"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </header>
      <TeacherWorkspace
        name={user.name}
        courses={courses}
        pending={pending}
        atRisk={atRisk}
      />
    </>
  );
}
