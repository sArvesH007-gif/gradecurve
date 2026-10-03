import Link from "next/link";
import { ArrowLeft, GraduationCap, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LoginPageProps = {
  searchParams: Promise<{ role?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const role = params.role === "teacher" ? "TEACHER" : "STUDENT";
  const isTeacher = role === "TEACHER";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 sm:px-8">
      <header className="flex h-[76px] items-center border-b border-white/[0.08]">
        <Link
          href="/"
          className="text-muted hover:text-foreground inline-flex items-center gap-2 text-sm transition"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back to GradeCurve
        </Link>
      </header>
      <section className="grid flex-1 place-items-center py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="p-7 pb-5 sm:p-8 sm:pb-5">
            <div className="border-violet/20 bg-violet/10 mb-3 grid size-11 place-items-center rounded-2xl border text-violet-200">
              {isTeacher ? (
                <ShieldCheck size={21} aria-hidden="true" />
              ) : (
                <GraduationCap size={22} aria-hidden="true" />
              )}
            </div>
            <CardTitle className="text-2xl">
              {isTeacher ? "Faculty sign in" : "Student sign in"}
            </CardTitle>
            <CardDescription>
              Sign in to your GradeCurve workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-7 pt-0 sm:p-8 sm:pt-0">
            {params.error && (
              <p
                role="alert"
                className="border-amber/20 bg-amber/10 mb-5 rounded-xl border px-3 py-2 text-sm text-amber-200"
              >
                {params.error === "role"
                  ? "That account does not have access to this workspace. Choose its matching role to sign in."
                  : "Check your credentials and selected role, then try again."}
              </p>
            )}
            <form action="/api/login" method="post" className="grid gap-4">
              <input type="hidden" name="role" value={role} />
              <label
                className="grid gap-2 text-sm font-medium"
                htmlFor="username"
              >
                {isTeacher ? "Email address" : "Registration number"}
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  required
                  maxLength={120}
                />
              </label>
              <label
                className="grid gap-2 text-sm font-medium"
                htmlFor="password"
              >
                Password
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                />
              </label>
              <button
                type="submit"
                className="bg-violet shadow-glow hover:bg-violet/90 mt-2 inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition"
              >
                Sign in
              </button>
            </form>
            <p className="text-muted mt-5 text-center text-xs leading-5">
              Use the password configured for this account.
            </p>
            <div className="mt-5 flex justify-center gap-4 border-t border-white/[0.08] pt-5 text-sm">
              <Link
                className="text-muted hover:text-foreground"
                href="/login?role=student"
              >
                Student
              </Link>
              <Link
                className="text-muted hover:text-foreground"
                href="/login?role=teacher"
              >
                Faculty
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
      <footer className="text-muted border-t border-white/[0.08] py-5 text-center text-xs">
        Relative estimates are not official university grades.
      </footer>
    </main>
  );
}
