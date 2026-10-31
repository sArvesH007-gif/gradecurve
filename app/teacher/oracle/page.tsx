import Link from "next/link";
import { redirect } from "next/navigation";
import { OracleWorkspace } from "@/components/teacher/oracle-workspace";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export default async function OracleFacultyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?role=teacher");
  if (user.role !== "TEACHER") redirect("/login?role=student&error=role");

  return (
    <>
      <header className="mx-auto flex h-[68px] w-full max-w-7xl items-center justify-between border-b border-white/[0.08] px-5 sm:px-8">
        <Link href="/teacher" className="font-semibold tracking-tight">GradeCurve · Faculty</Link>
        <form action="/api/logout" method="post">
          <button className="text-muted hover:text-foreground text-sm transition" type="submit">Sign out</button>
        </form>
      </header>
      <OracleWorkspace />
    </>
  );
}
