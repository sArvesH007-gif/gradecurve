"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck2,
  GraduationCap,
  Sparkles,
  Target,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  calculateRequiredFatScore,
  calculateTargetScore,
  detectAtRiskStudent,
  getGradeTrajectory,
} from "@/lib/grading";
import {
  weightedCourseScore,
  type CourseAssessment,
} from "@/lib/grading/course-analytics";
import {
  AssessmentComparisonChart,
  ClassDistributionChart,
} from "@/components/student/analytics-charts";

export type StudentCourseData = {
  id: string;
  code: string;
  name: string;
  attendance: { present: number; total: number };
  assessments: CourseAssessment[];
  scores: Record<string, number | undefined>;
  assessmentMetrics: Array<{
    id: string;
    name: string;
    maxScore: number;
    weight: number;
    studentScore: number | null;
    classMean: number | null;
    standardDeviation: number;
    count: number;
    zScore: number | null;
  }>;
  currentWeighted: number;
  currentMean: number | null;
  currentZ: number | null;
  currentRank: number | null;
  cohortSize: number;
  peers: Array<{ id: string; name: string; zScore: number; strength: string }>;
  projections: Array<{
    difficulty: number;
    mean: number | null;
    standardDeviation: number;
    studentScore: number | null;
    bins: Array<{ range: string; count: number; containsStudent: boolean }>;
  }>;
};

type Props = {
  name: string;
  registrationNo: string;
  semester: number;
  slotName: string;
  courses: StudentCourseData[];
};
const panel =
  "rounded-2xl border border-white/[0.08] bg-panel/75 shadow-[0_18px_48px_rgba(0,0,0,0.15)] backdrop-blur-xl";
const targets = ["S", "A", "B", "C"] as const;

function distribution(
  scenario: StudentCourseData["projections"][number] | undefined,
) {
  if (!scenario) return [];
  const classSize = scenario.bins.reduce((sum, bin) => sum + bin.count, 0);
  return scenario.bins.map((bin, index) => {
    const center = index * 10 + 5;
    const z =
      scenario.mean == null || scenario.standardDeviation <= 0
        ? null
        : (center - scenario.mean) / scenario.standardDeviation;
    return {
      ...bin,
      bell:
        z == null
          ? 0
          : ((classSize * 10) /
              (scenario.standardDeviation * Math.sqrt(2 * Math.PI))) *
            Math.exp(-0.5 * z * z),
    };
  });
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
      <p className="text-muted text-xs">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight">
        {value}
      </p>
      {hint && <p className="text-muted mt-1 text-xs">{hint}</p>}
    </div>
  );
}

export function StudentWorkspace({
  name,
  registrationNo,
  semester,
  slotName,
  courses,
}: Props) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [target, setTarget] = useState<(typeof targets)[number]>("A");
  const [difficulty, setDifficulty] = useState(0);
  const course = courses.find(({ id }) => id === courseId) ?? courses[0];

  const metrics = useMemo(() => {
    if (!course) return null;
    const fat = course.assessments.find(
      ({ name }) => name.toUpperCase() === "FAT",
    );
    const scenario = course.projections.find(
      ({ difficulty: level }) => level === difficulty,
    );
    const studentCurrent = course.currentWeighted;
    const currentMean = course.currentMean;
    const currentZ = course.currentZ;
    const projectedMean = scenario?.mean ?? null;
    const projectedDeviation = scenario?.standardDeviation ?? 0;
    const preFatScore = weightedCourseScore(
      course.assessments.filter(({ id }) => id !== fat?.id),
      course.scores,
    );
    const projectedPreFatScores = Object.fromEntries(
      course.assessmentMetrics.map((assessment) => [
        assessment.id,
        course.scores[assessment.id] ?? assessment.classMean ?? undefined,
      ]),
    );
    const projectedPreFatScore = weightedCourseScore(
      course.assessments.filter(({ id }) => id !== fat?.id),
      projectedPreFatScores,
    );
    const targetTotal = calculateTargetScore(
      projectedMean,
      projectedDeviation,
      target,
    );
    const fatWeight =
      fat && fat.maxScore > 0 ? (100 * fat.weight) / fat.maxScore : 0;
    const calculatedRequiredFat = calculateRequiredFatScore(
      projectedPreFatScore,
      targetTotal,
      fatWeight,
      fat?.maxScore ?? 0,
    );
    const actualFatScore = fat ? course.scores[fat.id] : undefined;
    const requiredFat =
      actualFatScore == null
        ? calculatedRequiredFat
        : studentCurrent >= (targetTotal ?? Number.POSITIVE_INFINITY)
          ? {
              score: actualFatScore,
              attainable: true,
              alreadyAchieved: true,
              status: "Already achieved" as const,
            }
          : {
              ...calculatedRequiredFat,
              attainable: false,
              alreadyAchieved: false,
              status: "Already recorded" as const,
            };
    const completedWeight = course.assessments
      .filter(({ id }) => course.scores[id] != null)
      .reduce((sum, assessment) => sum + assessment.weight, 0);
    const remainingWeight = Math.max(
      0,
      course.assessments.reduce(
        (sum, assessment) => sum + assessment.weight,
        0,
      ) - completedWeight,
    );
    const projectedMe = scenario?.studentScore ?? studentCurrent;
    const attendancePercent = course.attendance.total
      ? (course.attendance.present / course.attendance.total) * 100
      : null;
    const risk = detectAtRiskStudent(currentZ, attendancePercent);
    const meAssessment = course.assessmentMetrics.map((assessment) => {
      const score = assessment.studentScore;
      return {
        name: assessment.name,
        score: score == null ? null : (score / assessment.maxScore) * 100,
        rawScore: score,
        mean:
          assessment.classMean == null
            ? null
            : (assessment.classMean / assessment.maxScore) * 100,
        maxScore: assessment.maxScore,
        weight: assessment.weight,
      };
    });
    return {
      studentCurrent,
      currentMean,
      currentZ,
      projectedMean,
      projectedMe,
      preFatScore,
      projectedPreFatScore,
      targetTotal,
      requiredFat,
      fat,
      completedWeight,
      remainingWeight,
      attendancePercent,
      risk,
      assessmentChart: meAssessment,
      histogram: distribution(scenario),
      peers: course.peers,
      currentRank: course.currentRank,
      cohortSize: course.cohortSize,
      assessmentMetrics: course.assessmentMetrics,
    };
  }, [course, target, difficulty]);

  const [fallbackCourseId, setFallbackCourseId] = useState(course?.id ?? "");
  const [assessmentId, setAssessmentId] = useState("");
  const [fallbackFeedback, setFallbackFeedback] = useState("");
  const [matchFeedback, setMatchFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fallbackCourse =
    courses.find(({ id }) => id === fallbackCourseId) ?? course;
  const availableAssessments = fallbackCourse?.assessments ?? [];
  const selectedFallbackAssessment = availableAssessments.find(
    ({ id }) => id === assessmentId,
  );

  async function submitFallback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    setFallbackFeedback("");
    const form = new FormData(formElement);
    const response = await fetch("/api/student/fallback", {
      method: "POST",
      body: JSON.stringify({
        courseId: form.get("courseId"),
        assessmentId: form.get("assessmentId"),
        score: form.get("score"),
        peerScores: form.get("peerScores"),
      }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await response.json();
    setFallbackFeedback(
      response.ok
        ? `Submitted for faculty review${result.isOutlier ? " (flagged as an outlier)" : ""}. It will not count in official analytics until approved.`
        : (result.error ?? "Submission failed. Please try again."),
    );
    if (response.ok) formElement.reset();
    setSubmitting(false);
  }

  async function requestMatch(peerId: string) {
    if (!course) return;
    setMatchFeedback("");
    const response = await fetch("/api/student/matches", {
      method: "POST",
      body: JSON.stringify({ courseId: course.id, peerId }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await response.json();
    setMatchFeedback(
      response.ok
        ? "Study match request sent."
        : (result.error ?? "Could not send the request."),
    );
  }

  if (!course || !metrics)
    return (
      <main className="text-muted mx-auto max-w-7xl px-5 py-16">
        No active course enrollment was found for this student.
      </main>
    );

  return (
    <motion.main
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10"
    >
      <section className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="text-cyan inline-flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase">
            <GraduationCap size={15} /> Student analytics
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Welcome back, {name.split(" ")[0]}
          </h1>
          <p className="text-muted mt-2 text-sm">
            A clear read on your progress, relative standing, and next step.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <span className="text-muted rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
            Reg no.{" "}
            <b className="text-foreground ml-1 font-mono">{registrationNo}</b>
          </span>
          <span className="text-muted rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
            Active slot <b className="text-foreground ml-1">{slotName}</b>
          </span>
          <span className="text-muted rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
            Semester <b className="text-foreground ml-1">{semester}</b>
          </span>
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Current weighted score"
          value={`${metrics.studentCurrent.toFixed(1)}%`}
          hint={`${(metrics.completedWeight * 100).toFixed(0)}% of course weight graded`}
        />
        <Stat
          label="Section position"
          value={
            metrics.cohortSize
              ? `#${metrics.currentRank}/${metrics.cohortSize}`
              : "—"
          }
          hint="Among students with the same graded work"
        />
        <Stat
          label="Overall Z-score"
          value={
            metrics.currentZ == null
              ? "—"
              : Number.isFinite(metrics.currentZ)
                ? `${metrics.currentZ >= 0 ? "+" : ""}${metrics.currentZ.toFixed(2)}σ`
                : metrics.currentZ > 0
                  ? "+∞"
                  : "−∞"
          }
          hint={
            metrics.currentMean == null
              ? "Class comparison not available"
              : `Class average ${metrics.currentMean.toFixed(1)}%`
          }
        />
        <Stat
          label="Projected trajectory"
          value={getGradeTrajectory(metrics.currentZ).replace(
            " Grade Trajectory",
            "",
          )}
          hint="Based on completed marks in this section"
        />
        <Stat
          label="Attendance"
          value={
            metrics.attendancePercent == null
              ? "—"
              : `${metrics.attendancePercent.toFixed(0)}%`
          }
          hint={`${metrics.risk.atRisk ? "Support check-in may help" : "Across recorded sessions"}`}
        />
      </section>

      <section className="mb-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <article className={`${panel} p-5 sm:p-6`}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-muted text-xs font-medium">
                Course performance
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Marks against your class
              </h2>
            </div>
            <label className="sr-only" htmlFor="course-select">
              Select course
            </label>
            <select
              id="course-select"
              value={course.id}
              onChange={(event) => {
                setCourseId(event.target.value);
                setFallbackCourseId(event.target.value);
              }}
              className="text-foreground h-10 max-w-full rounded-xl border border-white/10 bg-[#111725] px-3 text-sm"
            >
              {courses.map(({ id, code, name: courseName }) => (
                <option key={id} value={id}>
                  {code} · {courseName}
                </option>
              ))}
            </select>
          </div>
          <AssessmentComparisonChart data={metrics.assessmentChart} />
          <div className="text-muted mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
            {metrics.assessmentChart.map((item) => (
              <span key={item.name}>
                {item.name} ({(item.weight * 100).toFixed(0)}%):{" "}
                <b className="text-foreground font-mono">
                  {item.rawScore == null
                    ? "Not graded"
                    : `${item.rawScore}/${item.maxScore} raw`}
                </b>
              </span>
            ))}
          </div>
        </article>
        <article className={`${panel} p-5 sm:p-6`}>
          <div className="mb-2">
            <p className="text-muted text-xs font-medium">
              Section distribution
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              Projected course scores
            </h2>
          </div>
          <ClassDistributionChart
            data={metrics.histogram}
            mean={metrics.projectedMean}
          />
          <p className="text-muted mt-2 text-xs leading-5">
            Projected totals use the class mean for ungraded components and
            adjust the FAT mark for exam difficulty. Your bar is highlighted.
          </p>
        </article>
      </section>

      <section className="mb-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <article className={`${panel} p-5 sm:p-6`}>
          <div className="flex items-center gap-2">
            <Activity size={17} className="text-cyan" />
            <h2 className="text-lg font-semibold">Assessment trajectory</h2>
          </div>
          <div className="mt-4 divide-y divide-white/[0.07]">
            {metrics.assessmentMetrics.map((assessment) => {
              const progress = Math.min(
                100,
                Math.max(
                  0,
                  ((assessment.studentScore ?? 0) / assessment.maxScore) * 100,
                ),
              );
              const z = assessment.zScore;
              return (
                <div key={assessment.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {assessment.name} · {(assessment.weight * 100).toFixed(0)}%
                    </span>
                    <span className="text-muted font-mono text-xs">
                      {assessment.studentScore == null
                        ? "Awaiting mark"
                        : `${assessment.studentScore}/${assessment.maxScore}`}{" "}
                      · μ{" "}
                      {assessment.classMean == null
                        ? "—"
                        : assessment.classMean.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="from-violet to-cyan h-full rounded-full bg-gradient-to-r"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-muted mt-1.5 flex justify-between text-[11px]">
                    <span>{getGradeTrajectory(z)}</span>
                    <span className="font-mono">
                      Z{" "}
                      {z == null
                        ? "—"
                        : Number.isFinite(z)
                          ? z.toFixed(2)
                          : z > 0
                            ? "+∞"
                            : "−∞"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className={`${panel} p-5 sm:p-6`}>
          <div className="flex items-center gap-2">
            <Target size={17} className="text-violet-200" />
            <h2 className="text-lg font-semibold">FAT target predictor</h2>
          </div>
          <p className="text-muted mt-1 text-sm">
            Model a class difficulty shift and see the FAT mark needed for your
            target trajectory.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-[0.85fr_1.15fr]">
            <div>
              <span className="text-muted text-xs font-medium">
                Target trajectory
              </span>
              <div
                className="mt-2 grid grid-cols-4 gap-2"
                role="group"
                aria-label="Target grade"
              >
                {targets.map((grade) => (
                  <button
                    key={grade}
                    type="button"
                    onClick={() => setTarget(grade)}
                    aria-pressed={target === grade}
                    className={`h-10 rounded-lg border text-sm font-semibold transition ${target === grade ? "border-violet/60 bg-violet/20 text-white" : "text-muted border-white/10 bg-black/15 hover:text-white"}`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
              <label
                className="text-muted mt-5 block text-xs font-medium"
                htmlFor="difficulty"
              >
                What-if exam difficulty{" "}
                <span className="text-cyan float-right font-mono">
                  {difficulty > 0 ? "+" : ""}
                  {difficulty}%
                </span>
              </label>
              <input
                id="difficulty"
                type="range"
                min="-15"
                max="15"
                step="1"
                value={difficulty}
                onChange={(event) => setDifficulty(Number(event.target.value))}
                className="accent-violet mt-3 w-full"
              />
              <div className="text-muted flex justify-between text-[10px]">
                <span>−15%</span>
                <span>Current</span>
                <span>+15%</span>
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
              <p className="text-muted text-xs">
                Projected class mean{" "}
                <span className="text-foreground float-right font-mono">
                  {metrics.projectedMean == null
                    ? "—"
                    : `${metrics.projectedMean.toFixed(1)}%`}
                </span>
              </p>
              <div className="my-3 h-px bg-white/[0.08]" />
              <p className="text-muted text-xs">
                Current earned points{" "}
                <span className="text-foreground float-right font-mono">
                  {metrics.preFatScore.toFixed(1)}%
                </span>
              </p>
              <p className="text-muted mt-2 text-xs">
                Target weighted score{" "}
                <span className="text-foreground float-right font-mono">
                  {metrics.targetTotal == null
                    ? "—"
                    : `${metrics.targetTotal.toFixed(1)}%`}
                </span>
              </p>
              <p className="text-muted mt-2 text-xs">
                Remaining assessment weight{" "}
                <span className="text-foreground float-right font-mono">
                  {(metrics.remainingWeight * 100).toFixed(0)}%
                </span>
              </p>
              <p className="text-muted mt-2 text-xs">
                FAT marks remaining{" "}
                <span className="text-foreground float-right font-mono">
                  {metrics.fat
                    ? (
                        metrics.fat.maxScore -
                        (course.scores[metrics.fat.id] ?? 0)
                      ).toFixed(1)
                    : "—"}
                </span>
              </p>
              <div className="my-3 h-px bg-white/[0.08]" />
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-muted text-xs">Required FAT mark</p>
                  <p
                    className={`mt-1 font-mono text-3xl font-semibold ${metrics.requiredFat.attainable === false ? "text-amber-300" : "text-cyan"}`}
                  >
                    {metrics.requiredFat.score == null
                      ? "—"
                      : metrics.requiredFat.score >
                          (metrics.fat?.maxScore ?? 100)
                        ? `>${metrics.fat?.maxScore ?? 100}`
                        : `${metrics.requiredFat.score.toFixed(1)}`}
                  </p>
                </div>
                <span className="text-muted pb-1 text-right text-xs">
                  / {metrics.fat?.maxScore ?? 100}
                </span>
              </div>
              <p className="text-muted mt-2 flex items-center gap-1 text-xs">
                {metrics.requiredFat.alreadyAchieved ? (
                  <ArrowUpRight size={14} className="text-emerald" />
                ) : metrics.requiredFat.attainable === false ? (
                  <ArrowDownRight size={14} className="text-amber-300" />
                ) : (
                  <Sparkles size={14} className="text-cyan" />
                )}
                {metrics.requiredFat.status}
                {metrics.requiredFat.status === "Attainable" &&
                metrics.requiredFat.score != null
                  ? ` · ${((metrics.requiredFat.score / (metrics.fat?.maxScore ?? 100)) * 100).toFixed(0)}% of max`
                  : ""}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className={`${panel} p-5 sm:p-6`}>
          <div className="flex items-center gap-2">
            <CalendarCheck2 size={17} className="text-emerald" />
            <h2 className="text-lg font-semibold">Report a fallback mark</h2>
          </div>
          <p className="text-muted mt-1 text-sm">
            Reported marks stay out of official analytics until a teacher
            verifies them.
          </p>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={submitFallback}
          >
            <label className="text-muted grid gap-1.5 text-xs">
              Course
              <select
                name="courseId"
                value={fallbackCourseId}
                onChange={(event) => {
                  setFallbackCourseId(event.target.value);
                  setAssessmentId("");
                }}
                className="text-foreground h-10 rounded-lg border border-white/10 bg-[#111725] px-3 text-sm"
              >
                {courses.map(({ id, code }) => (
                  <option key={id} value={id}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-muted grid gap-1.5 text-xs">
              Assessment
              <select
                name="assessmentId"
                required
                value={assessmentId}
                onChange={(event) => setAssessmentId(event.target.value)}
                className="text-foreground h-10 rounded-lg border border-white/10 bg-[#111725] px-3 text-sm"
              >
                <option value="">Select assessment</option>
                {availableAssessments.map(({ id, name: assessmentName, maxScore, weight }) => (
                  <option key={id} value={id}>
                    {assessmentName} ({(weight * 100).toFixed(0)}% / {maxScore})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-muted grid gap-1.5 text-xs">
              Your mark
              <input
                name="score"
                type="number"
                min="0"
                max={selectedFallbackAssessment?.maxScore}
                step="0.1"
                required
                className="text-foreground h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-sm"
                placeholder="e.g. 72"
              />
            </label>
            <label className="text-muted grid gap-1.5 text-xs">
              Peer marks (comma-separated)
              <input
                name="peerScores"
                className="text-foreground h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-sm"
                placeholder="68, 74, 79"
              />
            </label>
            <button
              disabled={submitting}
              className="bg-violet hover:bg-violet/90 h-10 rounded-lg px-4 text-sm font-semibold text-white transition disabled:opacity-50 sm:col-span-2"
              type="submit"
            >
              {submitting ? "Sending…" : "Submit for review"}
            </button>
          </form>
          {fallbackFeedback && (
            <p role="status" className="text-muted mt-3 text-xs leading-5">
              {fallbackFeedback}
            </p>
          )}
        </article>
        <article className={`${panel} p-5 sm:p-6`}>
          <div className="flex items-center gap-2">
            <GraduationCap size={17} className="text-violet-200" />
            <h2 className="text-lg font-semibold">Study with a strong peer</h2>
          </div>
          <p className="text-muted mt-1 text-sm">
            Students in your active slot who are at least 1.2σ above the current
            course mean.
          </p>
          <div className="mt-4 divide-y divide-white/[0.07]">
            {metrics.currentZ == null || metrics.currentZ >= 0 ? (
              <p className="text-muted py-4 text-sm">
                Study matches surface here when your current course standing
                falls below the section average.
              </p>
            ) : metrics.peers.length === 0 ? (
              <p className="text-muted py-4 text-sm">
                No same-section students currently meet the +1.2σ match
                threshold.
              </p>
            ) : (
              metrics.peers.map((peer) => (
                <div
                  key={peer.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">{peer.name}</p>
                    <p className="text-muted mt-1 text-xs">
                      {course.code} · Strength: {peer.strength}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-cyan font-mono text-sm">
                      +{peer.zScore?.toFixed(2)}σ
                    </span>
                    <button
                      onClick={() => requestMatch(peer.id)}
                      className="border-violet/25 bg-violet/10 hover:bg-violet/20 h-9 rounded-lg border px-3 text-xs font-semibold text-violet-100"
                      type="button"
                    >
                      Request match
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {matchFeedback && (
            <p role="status" className="text-muted mt-3 text-xs">
              {matchFeedback}
            </p>
          )}
        </article>
      </section>
      <p className="text-muted mt-8 text-center text-xs leading-5">
        Relative grading analytics are estimates and simulations; official
        outcomes remain determined by institutional policy.
      </p>
    </motion.main>
  );
}
