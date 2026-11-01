"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Course = { id: number; code: string; name: string; semester: number; enrollmentCount: number };
type Slot = { id: number; name: string };
type Student = { id: number; registrationNo: string; name: string; slotName: string; canDelete: number };
type Assessment = { id: number; courseId: number; name: string; maxScore: number; weight: number; courseCode: string };
type Mark = { id: number; studentId: number; assessmentId: number; courseId: number; registrationNo: string; studentName: string; courseCode: string; assessmentName: string; score: number; maxScore: number };
type Workspace = { courses: Course[]; slots: Slot[]; students: Student[]; assessments: Assessment[]; marks: Mark[] };

const emptyWorkspace: Workspace = { courses: [], slots: [], students: [], assessments: [], marks: [] };
const panel = "rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5";
const input = "text-foreground h-10 w-full rounded-lg border border-white/10 bg-[#111725] px-3 text-sm";
const label = "text-muted grid gap-1.5 text-xs";
const button = "bg-violet hover:bg-violet/90 h-10 rounded-lg px-4 text-sm font-semibold text-white transition disabled:opacity-50";

export function OracleWorkspace() {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/oracle/workspace", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load Oracle records.");
      setData(result as Workspace);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Oracle records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/oracle/workspace", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load Oracle records.");
        if (active) {
          setData(result as Workspace);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load Oracle records.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function send(
    path: string,
    method: string,
    body?: Record<string, string | number>,
  ) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Oracle request failed.");
      setMessage(result.message ?? "Oracle record saved.");
      await refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Oracle request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const ok = await send("/api/oracle/courses", "POST", {
      code: String(values.get("code")),
      name: String(values.get("name")),
      semester: Number(values.get("semester")),
      slotId: Number(values.get("slotId")),
    });
    if (ok) form.reset();
  }

  async function createAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const ok = await send("/api/oracle/assessments", "POST", {
      courseId: Number(values.get("courseId")),
      name: String(values.get("name")),
      maxScore: Number(values.get("maxScore")),
      weight: Number(values.get("weight")),
    });
    if (ok) form.reset();
  }

  async function createStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const ok = await send("/api/oracle/students", "POST", {
      registrationNo: String(values.get("registrationNo")),
      name: String(values.get("name")),
      initialPassword: String(values.get("initialPassword")),
      courseId: Number(values.get("courseId")),
      slotId: Number(values.get("slotId")),
    });
    if (ok) form.reset();
  }

  async function updateMark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await send("/api/oracle/marks", "PUT", {
      studentId: Number(values.get("studentId")),
      assessmentId: Number(values.get("assessmentId")),
      score: Number(values.get("score")),
    });
  }

  async function updateAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await send("/api/oracle/attendance", "PUT", {
      studentId: Number(values.get("studentId")),
      courseId: Number(values.get("courseId")),
      attendanceDate: String(values.get("attendanceDate")),
      present: Number(values.get("present")),
    });
  }

  async function deleteCourse(course: Course) {
    if (!window.confirm(`Delete unused course ${course.code}? Courses with learner activity are protected.`)) return;
    await send(`/api/oracle/courses/${course.id}`, "DELETE");
  }

  async function deleteStudent(student: Student) {
    if (!window.confirm(`Delete empty student ${student.registrationNo}? Students with marks, attendance, or support activity are protected.`)) return;
    await send(`/api/oracle/students/${student.id}`, "DELETE");
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-cyan text-xs font-semibold tracking-[0.14em] uppercase">DA2 · Oracle Database Free</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Oracle faculty workspace</h1>
          <p className="text-muted mt-2 max-w-3xl text-sm leading-6">
            Read Oracle student and course records, create a course and assessment, update marks and attendance, and remove an unused course.
          </p>
        </div>
        <button className="text-muted h-10 rounded-lg border border-white/10 px-4 text-sm" onClick={() => { setLoading(true); void refresh(); }} type="button">
          Refresh Oracle records
        </button>
      </div>

      {(message || error || loading) && (
        <p role="status" className={`mb-5 rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-400/20 bg-rose-400/10 text-rose-100" : "border-cyan/20 bg-cyan/10 text-cyan-100"}`}>
          {error || (loading ? "Loading Oracle records…" : message)}
        </p>
      )}

      <section className="mb-6 grid gap-5 lg:grid-cols-2">
        <article className={panel}>
          <h2 className="text-lg font-semibold">Oracle courses</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted text-xs"><tr><th className="py-2">Code</th><th>Name</th><th>Students</th><th /></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data.courses.map((course) => (
                  <tr key={course.id}>
                    <td className="py-2 font-mono">{course.code}</td>
                    <td className="py-2">{course.name}</td>
                    <td className="py-2">{course.enrollmentCount}</td>
                    <td className="py-2 text-right">
                      <button disabled={busy || course.enrollmentCount > 0} onClick={() => void deleteCourse(course)} type="button" className="text-xs text-rose-200 underline disabled:cursor-not-allowed disabled:opacity-30" title="Only courses without learner activity can be deleted">
                        Delete empty
                      </button>
                    </td>
                  </tr>
                ))}
                {!data.courses.length && !loading && <tr><td className="text-muted py-3" colSpan={4}>No courses found for this faculty account.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
        <article className={panel}>
          <h2 className="text-lg font-semibold">Oracle student roster</h2>
          <div className="mt-4 max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted sticky top-0 bg-[#111725] text-xs"><tr><th className="py-2">Registration</th><th>Name</th><th>Slot</th><th /></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data.students.map((student) => <tr key={student.id}><td className="py-2 font-mono">{student.registrationNo}</td><td>{student.name}</td><td>{student.slotName}</td><td className="text-right"><button disabled={busy || !student.canDelete} onClick={() => void deleteStudent(student)} type="button" className="text-xs text-rose-200 underline disabled:cursor-not-allowed disabled:opacity-30" title="Only empty students in your class slots can be deleted">Delete empty</button></td></tr>)}
                {!data.students.length && !loading && <tr><td className="text-muted py-3" colSpan={4}>No student records found.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="mb-6 grid gap-5 md:grid-cols-2">
        <form className={`${panel} grid content-start gap-3`} onSubmit={createStudent}>
          <div><h2 className="text-lg font-semibold">Insert a student</h2><p className="text-muted mt-1 text-xs">Creates an Oracle account, profile, and course enrollment. The initial password is stored only as a salted hash.</p></div>
          <label className={label}>Registration number<input className={input} name="registrationNo" maxLength={24} pattern="[A-Za-z0-9-]+" required /></label>
          <label className={label}>Student name<input className={input} name="name" maxLength={160} required /></label>
          <label className={label}>Initial password<input className={input} name="initialPassword" type="password" minLength={12} maxLength={256} autoComplete="new-password" required /></label>
          <label className={label}>Course<select className={input} name="courseId" required defaultValue=""><option value="" disabled>Select course</option>{data.courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}</select></label>
          <label className={label}>Class slot<select className={input} name="slotId" required defaultValue=""><option value="" disabled>Select slot</option>{data.slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}</option>)}</select></label>
          <button className={button} disabled={busy || !data.courses.length || !data.slots.length} type="submit">Insert student</button>
        </form>
        <form className={`${panel} grid content-start gap-3`} onSubmit={createCourse}>
          <div><h2 className="text-lg font-semibold">Insert a course</h2><p className="text-muted mt-1 text-xs">Creates an Oracle course and its class-slot offering.</p></div>
          <label className={label}>Course code<input className={input} name="code" maxLength={20} pattern="[A-Za-z0-9-]+" placeholder="ORCL-DEMO" required /></label>
          <label className={label}>Course name<input className={input} name="name" maxLength={160} placeholder="Oracle SQL lab" required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Semester<input className={input} name="semester" type="number" min={1} max={12} defaultValue={5} required /></label>
            <label className={label}>Faculty slot<select className={input} name="slotId" required defaultValue=""><option value="" disabled>Select slot</option>{data.slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}</option>)}</select></label>
          </div>
          <button className={button} disabled={busy || !data.slots.length} type="submit">Insert course</button>
        </form>

        <form className={`${panel} grid content-start gap-3`} onSubmit={createAssessment}>
          <div><h2 className="text-lg font-semibold">Insert an assessment</h2><p className="text-muted mt-1 text-xs">The course total weight cannot exceed 100%.</p></div>
          <label className={label}>Course<select className={input} name="courseId" required defaultValue=""><option value="" disabled>Select course</option>{data.courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}</select></label>
          <label className={label}>Assessment name<input className={input} name="name" maxLength={24} placeholder="LAB1" required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Maximum raw mark<input className={input} name="maxScore" type="number" min={0.1} step="0.1" defaultValue={10} required /></label>
            <label className={label}>Course weight (fraction)<input className={input} name="weight" type="number" min={0.01} max={1} step="0.01" defaultValue={0.1} required /></label>
          </div>
          <button className={button} disabled={busy || !data.courses.length} type="submit">Insert assessment</button>
        </form>

        <form className={`${panel} grid content-start gap-3`} onSubmit={updateMark}>
          <div><h2 className="text-lg font-semibold">Insert or update a mark</h2><p className="text-muted mt-1 text-xs">Calls the validated Oracle upsert procedure; the update trigger records changed scores.</p></div>
          <label className={label}>Student<select className={input} name="studentId" required defaultValue=""><option value="" disabled>Select student</option>{data.students.map((student) => <option key={student.id} value={student.id}>{student.registrationNo} · {student.name}</option>)}</select></label>
          <label className={label}>Assessment<select className={input} name="assessmentId" required defaultValue=""><option value="" disabled>Select assessment</option>{data.assessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{assessment.courseCode} · {assessment.name} (max {assessment.maxScore})</option>)}</select></label>
          <label className={label}>Raw mark<input className={input} name="score" type="number" min={0} step="0.1" placeholder="e.g. 36.5" required /></label>
          <button className={button} disabled={busy || !data.assessments.length} type="submit">Save mark</button>
        </form>

        <form className={`${panel} grid content-start gap-3`} onSubmit={updateAttendance}>
          <div><h2 className="text-lg font-semibold">Insert or update attendance</h2><p className="text-muted mt-1 text-xs">Calls the validated Oracle attendance procedure for an enrolled student.</p></div>
          <label className={label}>Student<select className={input} name="studentId" required defaultValue=""><option value="" disabled>Select student</option>{data.students.map((student) => <option key={student.id} value={student.id}>{student.registrationNo} · {student.name}</option>)}</select></label>
          <label className={label}>Course<select className={input} name="courseId" required defaultValue=""><option value="" disabled>Select course</option>{data.courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Class date<input className={input} name="attendanceDate" type="date" defaultValue="2026-08-01" required /></label>
            <label className={label}>Attendance<select className={input} name="present" defaultValue="1"><option value="1">Present</option><option value="0">Absent</option></select></label>
          </div>
          <button className={button} disabled={busy || !data.courses.length} type="submit">Save attendance</button>
        </form>
      </section>

      <section className={panel}>
        <h2 className="text-lg font-semibold">Oracle assessment marks</h2>
        <div className="mt-4 max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted sticky top-0 bg-[#111725] text-xs"><tr><th className="py-2">Course</th><th>Student</th><th>Assessment</th><th>Score</th></tr></thead>
            <tbody className="divide-y divide-white/[0.06]">
              {data.marks.slice(0, 150).map((mark) => <tr key={mark.id}><td className="py-2">{mark.courseCode}</td><td>{mark.registrationNo} · {mark.studentName}</td><td>{mark.assessmentName}</td><td>{mark.score}/{mark.maxScore}</td></tr>)}
              {!data.marks.length && !loading && <tr><td className="text-muted py-3" colSpan={4}>No marks found for assigned courses.</td></tr>}
            </tbody>
          </table>
          {data.marks.length > 150 && <p className="text-muted mt-2 text-xs">Showing the first 150 of {data.marks.length} Oracle mark records.</p>}
        </div>
      </section>
    </main>
  );
}
