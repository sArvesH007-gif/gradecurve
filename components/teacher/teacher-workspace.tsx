"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import type { CourseAssessment } from "@/lib/grading/course-analytics";

export type TeacherRosterRow = {
  studentId: string;
  name: string;
  registrationNo: string;
  slotId: string;
  slotName: string;
  scores: Record<string, number>;
};
export type TeacherCourseData = {
  id: string;
  code: string;
  name: string;
  average: number | null;
  enrollmentCount: number;
  assessments: CourseAssessment[];
  slots: Array<{ id: string; name: string; enrollmentCount: number }>;
  roster: TeacherRosterRow[];
};
export type VerificationItem = {
  id: string;
  studentName: string;
  registrationNo: string;
  courseId: string;
  courseCode: string;
  assessmentId: string;
  assessmentName: string;
  score: number;
  maxScore: number;
  peerScores: number[];
  isOutlier: boolean;
  createdAt: string;
};
export type RiskItem = {
  studentId: string;
  studentName: string;
  registrationNo: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  zScore: number | null;
  attendance: number | null;
  reasons: string[];
};

type Props = {
  name: string;
  courses: TeacherCourseData[];
  pending: VerificationItem[];
  atRisk: RiskItem[];
};
const panel =
  "rounded-2xl border border-white/[0.08] bg-panel/75 shadow-[0_18px_48px_rgba(0,0,0,0.15)] backdrop-blur-xl";

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className={`${panel} p-4`}>
      <p className="text-muted text-xs">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold">{value}</p>
      <p className="text-muted mt-1 text-xs">{sub}</p>
    </div>
  );
}

export function TeacherWorkspace({ name, courses, pending, atRisk }: Props) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const course = courses.find(({ id }) => id === courseId) ?? courses[0];
  const [slotId, setSlotId] = useState(course?.slots[0]?.id ?? "");
  const [assessmentId, setAssessmentId] = useState(
    course?.assessments[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const roster = useMemo(
    () => course?.roster.filter((student) => student.slotId === slotId) ?? [],
    [course, slotId],
  );
  const assignedSlots = new Set(
    courses.flatMap(({ slots }) => slots.map(({ id }) => id)),
  );
  const enrollmentCount = courses.reduce(
    (sum, item) => sum + item.enrollmentCount,
    0,
  );
  const selectedAssessment = course?.assessments.find(
    ({ id }) => id === assessmentId,
  );

  function changeCourse(nextId: string) {
    const next = courses.find(({ id }) => id === nextId);
    setCourseId(nextId);
    setSlotId(next?.slots[0]?.id ?? "");
    setAssessmentId(next?.assessments[0]?.id ?? "");
  }

  async function saveBatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!course || !selectedAssessment) return;
    const form = new FormData(event.currentTarget);
    const marks = roster.flatMap((student) => {
      const value = form.get(`score-${student.studentId}`)?.toString().trim();
      return value ? [{ studentId: student.studentId, score: value }] : [];
    });
    if (!marks.length) {
      setStatus("Enter at least one new mark before saving.");
      return;
    }
    setBusy(true);
    setStatus("");
    const response = await fetch("/api/teacher/batch-marks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: course.id,
        slotId,
        assessmentId,
        marks,
      }),
    });
    const result = await response.json();
    setStatus(
      response.ok
        ? `Saved ${result.saved} mark${result.saved === 1 ? "" : "s"}.`
        : (result.error ?? "Unable to save marks."),
    );
    if (response.ok) window.location.reload();
    setBusy(false);
  }

  async function decideSubmission(
    formElement: HTMLFormElement,
    submissionId: string,
    decision: "APPROVED" | "REJECTED",
  ) {
    const form = new FormData(formElement);
    setBusy(true);
    setStatus("");
    const rawOverride = form.get("overrideScore")?.toString().trim();
    const response = await fetch("/api/teacher/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId,
        decision,
        overrideScore: rawOverride ? Number(rawOverride) : null,
        note: form.get("note")?.toString(),
      }),
    });
    const result = await response.json();
    setStatus(
      response.ok
        ? "Verification decision saved."
        : (result.error ?? "Unable to save this decision."),
    );
    if (response.ok) window.location.reload();
    setBusy(false);
  }

  async function sendGuidance(student: RiskItem) {
    setBusy(true);
    setStatus("");
    const response = await fetch("/api/teacher/guidance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: student.studentId,
        courseId: student.courseId,
        message: `Supportive check-in recommended. Risk indicators: ${student.reasons.join("; ")}.`,
      }),
    });
    const result = await response.json();
    setStatus(
      response.ok
        ? `Guidance alert sent to ${student.studentName}.`
        : (result.error ?? "Unable to send the alert."),
    );
    setBusy(false);
  }

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
            <BookOpen size={15} /> Faculty command center
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Good day, {name.split(" ").slice(-1)[0]}
          </h1>
          <p className="text-muted mt-2 text-sm">
            Course operations, verification, and timely student support in one
            view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/teacher/oracle" className="border-cyan/20 bg-cyan/10 rounded-xl border px-4 py-3 text-xs font-semibold text-cyan-100 hover:bg-cyan/15">
            Oracle DA2 workspace
          </Link>
          <div className="text-muted rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs">
            Assigned courses{" "}
            <b className="text-foreground ml-2 font-mono">{courses.length}</b>
            <span className="mx-3 text-white/15">·</span>Sections{" "}
            <b className="text-foreground ml-1 font-mono">{assignedSlots.size}</b>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Students enrolled"
          value={enrollmentCount}
          sub="Across assigned courses and sections"
        />
        <Metric
          label="Course average"
          value={
            courses.length
              ? `${(courses.reduce((sum, item) => sum + (item.average ?? 0), 0) / Math.max(1, courses.filter(({ average }) => average != null).length)).toFixed(1)}%`
              : "—"
          }
          sub="Mean of available weighted coursework"
        />
        <Metric
          label="Awaiting verification"
          value={pending.length}
          sub="Student reported marks"
        />
        <Metric
          label="At-risk students"
          value={atRisk.length}
          sub="Course-level support indicators"
        />
      </section>

      {status && (
        <p
          role="status"
          className="border-cyan/20 bg-cyan/10 mb-5 rounded-xl border px-4 py-3 text-sm text-cyan-100"
        >
          {status}
        </p>
      )}

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        {courses.map((item) => (
          <article key={item.id} className={`${panel} p-5`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-cyan text-xs font-semibold tracking-wider">
                  {item.code}
                </p>
                <h2 className="mt-1 font-semibold">{item.name}</h2>
              </div>
              <BarChart3 size={18} className="text-violet-200" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-black/15 p-3">
                <p className="text-muted text-xs">Weighted class mean</p>
                <p className="mt-1 font-mono text-lg">
                  {item.average == null ? "—" : `${item.average.toFixed(1)}%`}
                </p>
              </div>
              <div className="rounded-lg bg-black/15 p-3">
                <p className="text-muted text-xs">Enrolled students</p>
                <p className="mt-1 font-mono text-lg">{item.enrollmentCount}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.slots.map((slot) => (
                <span
                  key={slot.id}
                  className="text-muted rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-xs"
                >
                  {slot.name}{" "}
                  <b className="text-foreground ml-1 font-mono">
                    {slot.enrollmentCount}
                  </b>
                </span>
              ))}
            </div>
          </article>
        ))}
        {courses.length === 0 && (
          <p className="text-muted text-sm">
            No course assignments were found for this faculty account.
          </p>
        )}
      </section>

      {course && (
        <section className={`${panel} mb-6 p-5 sm:p-6`}>
          <div className="mb-5 flex items-center gap-2">
            <ClipboardList size={17} className="text-cyan" />
            <h2 className="text-lg font-semibold">Batch mark entry</h2>
          </div>
          <form onSubmit={saveBatch}>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <label className="text-muted grid gap-1.5 text-xs">
                Course
                <select
                  value={course.id}
                  onChange={(event) => changeCourse(event.target.value)}
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
                Slot
                <select
                  value={slotId}
                  onChange={(event) => setSlotId(event.target.value)}
                  className="text-foreground h-10 rounded-lg border border-white/10 bg-[#111725] px-3 text-sm"
                >
                  {course.slots.map(({ id, name: slotName }) => (
                    <option key={id} value={id}>
                      {slotName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-muted grid gap-1.5 text-xs">
                Assessment
                <select
                  value={assessmentId}
                  onChange={(event) => setAssessmentId(event.target.value)}
                  className="text-foreground h-10 rounded-lg border border-white/10 bg-[#111725] px-3 text-sm"
                >
                  {course.assessments.map(({ id, name: assessmentName, maxScore, weight }) => (
                    <option key={id} value={id}>
                      {assessmentName} ({(weight * 100).toFixed(0)}% / {maxScore})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="text-muted bg-white/[0.025] text-xs">
                  <tr>
                    <th className="px-3 py-3 font-medium">Reg no.</th>
                    <th className="px-3 py-3 font-medium">Student</th>
                    <th className="px-3 py-3 font-medium">Current raw mark</th>
                    <th className="px-3 py-3 font-medium">New raw mark</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {roster.map((student) => {
                    const mark = selectedAssessment
                      ? student.scores[selectedAssessment.id]
                      : undefined;
                    return (
                      <tr key={student.studentId}>
                        <td className="text-muted px-3 py-2.5 font-mono text-xs">
                          {student.registrationNo}
                        </td>
                        <td className="px-3 py-2.5">{student.name}</td>
                        <td className="px-3 py-2.5 font-mono">
                          {mark == null ? "—" : mark}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            name={`score-${student.studentId}`}
                            type="number"
                            min="0"
                            max={selectedAssessment?.maxScore}
                            step="0.1"
                            className="h-9 w-28 rounded-lg border border-white/10 bg-black/20 px-2 font-mono text-sm"
                            aria-label={`New mark for ${student.name}`}
                          />
                        </td>
                        <td className="text-muted px-3 py-2.5 text-xs">
                          {mark == null ? "Not entered" : "Recorded"}
                        </td>
                      </tr>
                    );
                  })}
                  {roster.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-muted px-3 py-8 text-center text-sm"
                      >
                        No enrolled students in this slot.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted text-xs">
                Blank new marks are skipped. Maximum:{" "}
                {selectedAssessment?.maxScore ?? "—"}.
              </p>
              <button
                disabled={busy || !roster.length}
                className="bg-violet hover:bg-violet/90 h-10 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50"
                type="submit"
              >
                Save batch
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="mb-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <article className={`${panel} p-5 sm:p-6`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={17} className="text-cyan" />
              <h2 className="text-lg font-semibold">Verification queue</h2>
            </div>
            <span className="bg-amber/10 rounded-full px-2.5 py-1 text-xs text-amber-200">
              {pending.length} pending
            </span>
          </div>
          <div className="space-y-3">
            {pending.map((item) => (
              <form
                key={item.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  void decideSubmission(
                    event.currentTarget,
                    item.id,
                    "APPROVED",
                  );
                }}
                className="rounded-xl border border-white/[0.07] bg-black/10 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {item.studentName}{" "}
                      <span className="text-muted font-mono text-xs font-normal">
                        {item.registrationNo}
                      </span>
                    </p>
                    <p className="text-muted mt-1 text-xs">
                      {item.courseCode} · {item.assessmentName} · reported{" "}
                      {item.score}/{item.maxScore}
                    </p>
                  </div>
                  {item.isOutlier && (
                    <span className="bg-amber/10 rounded-full px-2 py-1 text-[10px] font-semibold text-amber-200">
                      Outlier flagged
                    </span>
                  )}
                </div>
                <p className="text-muted mt-2 text-xs">
                  Peer marks:{" "}
                  {item.peerScores.length
                    ? item.peerScores.join(", ")
                    : "Not provided"}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    name="overrideScore"
                    type="number"
                    min="0"
                    max={item.maxScore}
                    step="0.1"
                    placeholder="Override mark (optional)"
                    aria-label={`Override score for ${item.studentName}`}
                    className="h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-xs"
                  />
                  <button
                    disabled={busy}
                    className="bg-emerald/15 hover:bg-emerald/25 h-9 rounded-lg px-3 text-xs font-semibold text-emerald-100"
                    type="submit"
                  >
                    Approve reported
                  </button>
                  <button
                    disabled={busy}
                    onClick={(event) => {
                      const form = event.currentTarget.form;
                      if (form)
                        void decideSubmission(form, item.id, "REJECTED");
                    }}
                    className="text-muted hover:text-foreground h-9 rounded-lg border border-white/10 px-3 text-xs"
                    type="button"
                  >
                    Reject / override
                  </button>
                </div>
              </form>
            ))}
            {pending.length === 0 && (
              <p className="text-muted py-6 text-sm">
                No marks are waiting for review.
              </p>
            )}
          </div>
        </article>
        <article className={`${panel} p-5 sm:p-6`}>
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={17} className="text-amber-200" />
            <h2 className="text-lg font-semibold">At-risk students</h2>
          </div>
          <p className="text-muted mb-4 text-xs">
            Flagged for cumulative Z below −1.0 or attendance below 75%.
          </p>
          <div className="space-y-3">
            {atRisk.map((student) => (
              <div
                key={`${student.studentId}:${student.courseId}`}
                className="rounded-xl border border-white/[0.07] bg-black/10 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {student.studentName}
                    </p>
                    <p className="text-muted mt-1 font-mono text-[11px]">
                      {student.registrationNo} · {student.courseCode}
                    </p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => void sendGuidance(student)}
                    type="button"
                    className="border-amber/20 bg-amber/10 hover:bg-amber/20 h-8 rounded-lg border px-2.5 text-xs font-medium text-amber-100"
                  >
                    Send guidance
                  </button>
                </div>
                <div className="text-muted mt-3 flex gap-4 text-xs">
                  <span>
                    Z-score{" "}
                    <b className="text-foreground font-mono">
                      {student.zScore == null
                        ? "—"
                        : Number.isFinite(student.zScore)
                          ? student.zScore.toFixed(2)
                          : "−∞"}
                    </b>
                  </span>
                  <span>
                    Attendance{" "}
                    <b className="text-foreground font-mono">
                      {student.attendance == null
                        ? "—"
                        : `${student.attendance.toFixed(0)}%`}
                    </b>
                  </span>
                </div>
                <p className="text-muted mt-2 text-[11px] leading-5">
                  {student.reasons.join(" · ")}
                </p>
              </div>
            ))}
            {atRisk.length === 0 && (
              <p className="text-muted py-6 text-sm">
                No students currently meet the at-risk criteria.
              </p>
            )}
          </div>
        </article>
      </section>
      <p className="text-muted text-center text-xs leading-5">
        Analytics guide timely support. Official grades remain governed by
        university policy.
      </p>
    </motion.main>
  );
}
