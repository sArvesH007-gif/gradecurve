import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const audiences = [
  {
    icon: GraduationCap,
    title: "For students",
    description:
      "Understand assessment results in the context of your own class section and plan the work ahead.",
    href: "/login?role=student",
    action: "Student login",
  },
  {
    icon: BarChart3,
    title: "For faculty",
    description:
      "Review course and section performance, verify reported marks, and coordinate timely guidance.",
    href: "/login?role=teacher",
    action: "Teacher login",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 sm:px-8">
      <header className="flex h-[76px] items-center justify-between border-b border-white/[0.08]">
        <Link
          href="/"
          className="flex items-center gap-3 font-semibold tracking-tight"
          aria-label="GradeCurve home"
        >
          <span className="from-violet to-cyan grid size-9 place-items-center rounded-xl bg-gradient-to-br text-lg font-bold text-white">
            g
          </span>
          GradeCurve
        </Link>
        <Link
          href="/login"
          className={cn(buttonStyles({ variant: "secondary", size: "sm" }))}
        >
          Sign in <ArrowRight aria-hidden="true" size={15} />
        </Link>
      </header>

      <section className="grid flex-1 items-center gap-12 py-16 md:grid-cols-[1.15fr_0.85fr] md:py-24">
        <div>
          <div className="border-violet/20 bg-violet/10 mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium text-violet-200">
            <ShieldCheck size={14} aria-hidden="true" /> Relative grading
            analytics
          </div>
          <h1 className="max-w-3xl text-5xl leading-[1.04] font-semibold tracking-[-0.055em] sm:text-6xl lg:text-7xl">
            Know where you stand.
            <span className="to-cyan mt-2 block bg-gradient-to-r from-violet-300 bg-clip-text text-transparent">
              Know what you need next.
            </span>
          </h1>
          <p className="text-muted mt-7 max-w-xl text-base leading-7 sm:text-lg sm:leading-8">
            GradeCurve gives students a clear view of progress relative to their
            class and helps faculty identify where support may be needed.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login?role=student"
              className={cn(buttonStyles({ size: "lg" }))}
            >
              Student login <ArrowRight aria-hidden="true" size={17} />
            </Link>
            <Link
              href="/login?role=teacher"
              className={cn(buttonStyles({ variant: "secondary", size: "lg" }))}
            >
              Teacher login
            </Link>
          </div>
        </div>

        <div className="relative">
          <div
            className="bg-violet/10 absolute -inset-5 rounded-[2rem] blur-3xl"
            aria-hidden="true"
          />
          <div className="bg-panel/80 relative rounded-3xl border border-white/10 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-violet-200 uppercase">
                  Relative grading
                </p>
                <h2 className="mt-3 text-xl font-semibold">
                  A clearer picture of progress
                </h2>
              </div>
              <div className="border-cyan/20 bg-cyan/10 text-cyan grid size-11 shrink-0 place-items-center rounded-2xl border">
                <BarChart3 size={21} aria-hidden="true" />
              </div>
            </div>
            <div className="my-7 h-px bg-white/[0.08]" />
            <p className="text-muted text-sm leading-6">
              Results are compared with classmates in the same course section.
              Students can explore projections while faculty retain control of
              verified marks and official records.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-4">
                <div className="text-sm font-medium">Student workspace</div>
                <div className="text-muted mt-1 text-xs leading-5">
                  Relative position, course analytics, and target simulations.
                </div>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-4">
                <div className="text-sm font-medium">Faculty workspace</div>
                <div className="text-muted mt-1 text-xs leading-5">
                  Class operations, mark review, and student support.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="grid gap-4 pb-14 md:grid-cols-2"
        aria-label="Choose a workspace"
      >
        {audiences.map(({ icon: Icon, title, description, href, action }) => (
          <article
            key={title}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 transition hover:border-white/15 hover:bg-white/[0.04]"
          >
            <Icon className="text-cyan" size={20} aria-hidden="true" />
            <h2 className="mt-4 font-semibold">{title}</h2>
            <p className="text-muted mt-2 text-sm leading-6">{description}</p>
            <Link
              href={href}
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-violet-200 hover:text-white"
            >
              {action} <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </article>
        ))}
      </section>

      <footer className="text-muted border-t border-white/[0.08] py-5 text-center text-xs leading-5">
        GradeCurve trajectories are analytical estimates and simulations.
        Official grades remain determined by institutional policy.
      </footer>
    </main>
  );
}
