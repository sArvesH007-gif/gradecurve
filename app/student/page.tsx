import Link from "next/link";
import { redirect } from "next/navigation";
import { StudentWorkspace } from "@/components/student/student-workspace";
import { getCurrentUser } from "@/lib/auth/session";
import { loadOracleStudentDashboard } from "@/lib/oracle/dashboard-data";
import { logOracleFailure } from "@/lib/oracle/client";

export const runtime = "nodejs";

export default async function StudentHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?role=student");
  if (user.role !== "STUDENT") redirect("/login?role=teacher&error=role");

  let dashboard;
  try {
    dashboard = await loadOracleStudentDashboard(user.id);
  } catch (error) {
    logOracleFailure(error);
    throw new Error("Oracle student dashboard data is temporarily unavailable.");
  }
  if (!dashboard) redirect("/login?role=student&error=1");

  return (
    <>
      <header className="mx-auto flex h-[68px] w-full max-w-7xl items-center justify-between border-b border-white/[0.08] px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="from-violet to-cyan grid size-8 place-items-center rounded-lg bg-gradient-to-br text-sm text-white">g</span>
          GradeCurve
        </Link>
        <form action="/api/logout" method="post">
          <button className="text-muted hover:text-foreground text-sm transition" type="submit">Sign out</button>
        </form>
      </header>
      <StudentWorkspace
        name={user.name}
        registrationNo={dashboard.registrationNo}
        semester={dashboard.semester}
        slotName={dashboard.slotName}
        courses={dashboard.courses}
      />
    </>
  );
}
