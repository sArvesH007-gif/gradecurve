import Link from "next/link";
import { redirect } from "next/navigation";
import {
  StudentWorkspace,
  type StudentCourseData,
} from "@/components/student/student-workspace";
import { getCurrentUser } from "@/lib/auth/session";
import { calculateMean, calculateStandardDeviation } from "@/lib/grading";
import {
  buildAssessmentAnalytics,
  cumulativeStudentZScore,
  projectedClassTotals,
  weightedCourseScore,
} from "@/lib/grading/course-analytics";
import { prisma } from "@/lib/db/prisma";

export default async function StudentHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?role=student");
  if (user.role !== "STUDENT") redirect("/login?role=teacher&error=role");

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    include: { activeSlot: true },
  });
  if (!profile) redirect("/login?role=student&error=1");

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: profile.id },
    include: {
      course: { include: { assessments: { orderBy: { name: "asc" } } } },
    },
    orderBy: { course: { code: "asc" } },
  });

  const courseData = await Promise.all(
    enrollments.map(async ({ course }) => {
      const [classEnrollments, attendanceRows] = await Promise.all([
        prisma.enrollment.findMany({
          where: { courseId: course.id, slotId: profile.activeSlotId },
          include: {
            student: {
              select: {
                id: true,
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
          where: { studentId: profile.id, courseId: course.id },
          select: { present: true },
        }),
      ]);

      const assessments = course.assessments.map(
        ({ id, name, maxScore, weight }) => ({ id, name, maxScore, weight }),
      );
      const classmates = classEnrollments.map(({ student }) => ({
        studentId: student.id,
        name: student.user.name,
        scores: Object.fromEntries(
          student.marks.map(({ assessmentId, score }) => [assessmentId, score]),
        ) as Record<string, number | undefined>,
      }));
      const me = classmates.find(({ studentId }) => studentId === profile.id);
      if (!me) return null;

      const assessmentResults = buildAssessmentAnalytics(
        assessments,
        classmates,
      );
      const assessmentMetrics = assessmentResults.map((assessment) => ({
        id: assessment.id,
        name: assessment.name,
        maxScore: assessment.maxScore,
        weight: assessment.weight,
        studentScore: me.scores[assessment.id] ?? null,
        classMean: assessment.mean,
        standardDeviation: assessment.standardDeviation,
        count: assessment.count,
        zScore:
          assessment.students.find(({ studentId }) => studentId === profile.id)
            ?.zScore ?? null,
      }));
      const assessedIds = assessments
        .filter(({ id }) => me.scores[id] != null)
        .map(({ id }) => id);
      const comparableScores = assessedIds.length
        ? classmates
            .filter((student) =>
              assessedIds.every((id) => student.scores[id] != null),
            )
            .map((student) =>
              weightedCourseScore(assessments, student.scores, assessedIds),
            )
        : [];
      const currentZ = cumulativeStudentZScore(
        assessments,
        classmates,
        profile.id,
        assessedIds,
      );
      const peers =
        currentZ != null && currentZ < 0
          ? classmates
              .filter(({ studentId }) => studentId !== profile.id)
              .map((student) => {
                const zScore = cumulativeStudentZScore(
                  assessments,
                  classmates,
                  student.studentId,
                  assessedIds,
                );
                const strength = assessmentResults
                  .map((assessment) => ({
                    name: assessment.name,
                    zScore: assessment.students.find(
                      ({ studentId }) => studentId === student.studentId,
                    )?.zScore,
                  }))
                  .filter(({ zScore }) => zScore != null)
                  .sort((a, b) => (b.zScore ?? 0) - (a.zScore ?? 0))[0];
                return {
                  id: student.studentId,
                  name: student.name,
                  zScore,
                  strength: strength?.name ?? "Course performance",
                };
              })
              .filter(
                (student) => student.zScore != null && student.zScore >= 1.2,
              )
              .map((student) => ({ ...student, zScore: student.zScore! }))
          : [];

      const fat = assessments.find(({ name }) => name.toUpperCase() === "FAT");
      const projections = Array.from(
        { length: 31 },
        (_, index) => index - 15,
      ).map((difficulty) => {
        const projected = projectedClassTotals(
          assessments,
          classmates,
          fat?.id ?? "",
          difficulty,
        );
        const mean = calculateMean(projected.map(({ score }) => score));
        const standardDeviation = calculateStandardDeviation(
          projected.map(({ score }) => score),
        );
        const studentScore =
          projected.find(({ studentId }) => studentId === profile.id)?.score ??
          null;
        const bins = Array.from({ length: 10 }, (_, bin) => {
          const lower = bin * 10;
          return {
            range: `${lower}\u2013${lower + 10}`,
            count: projected.filter(
              ({ score }) =>
                score >= lower && (score < lower + 10 || bin === 9),
            ).length,
            containsStudent:
              studentScore != null &&
              studentScore >= lower &&
              (studentScore < lower + 10 || bin === 9),
          };
        });
        return { difficulty, mean, standardDeviation, studentScore, bins };
      });

      return {
        id: course.id,
        code: course.code,
        name: course.name,
        attendance: {
          present: attendanceRows.filter(({ present }) => present).length,
          total: attendanceRows.length,
        },
        assessments,
        scores: me.scores,
        assessmentMetrics,
        currentWeighted: weightedCourseScore(assessments, me.scores),
        currentMean: comparableScores.length
          ? calculateMean(comparableScores)
          : null,
        currentZ,
        currentRank: comparableScores.length
          ? 1 +
            comparableScores.filter(
              (score) => score > weightedCourseScore(assessments, me.scores),
            ).length
          : null,
        cohortSize: comparableScores.length,
        peers,
        projections,
      };
    }),
  );
  const courses = courseData.filter(
    (course): course is StudentCourseData => course != null,
  );

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
      <StudentWorkspace
        name={user.name}
        registrationNo={profile.registrationNo}
        semester={profile.semester}
        slotName={profile.activeSlot.name}
        courses={courses}
      />
    </>
  );
}
