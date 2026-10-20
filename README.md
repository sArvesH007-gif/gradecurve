# GradeCurve

GradeCurve is a relative grading analytics platform for university students and faculty. It is being built as a TypeScript full-stack application with Next.js App Router, PostgreSQL, Prisma ORM 7, Tailwind CSS 4, Zod, Recharts, Vitest, and Playwright.

## Application

- Student and faculty sign-in with role-separated, signed 12-hour sessions.
- Student analytics sourced from official marks, section comparisons, attendance, and a difficulty-adjusted FAT predictor.
- Fallback mark submissions with peer-score outlier checks and a faculty verification queue.
- Same-slot study match requests, gated by relative performance.
- Faculty course and section summaries, batch mark entry, verification decisions, and persisted at-risk guidance alerts.
- A reusable relative grading engine with unit coverage for missing marks, zero deviation, targets, outliers, and at-risk thresholds.
- PostgreSQL Prisma schema and initial migration, plus deterministic seed data for 45 students, two courses, and three class slots.
- PBKDF2-SHA256 password hashing for seeded demo accounts.

### Assessment structure

Course totals use raw marks converted into weighted points out of 100:

| Component | Raw maximum | Course weight |
| --- | ---: | ---: |
| CAT1 | 50 | 15% |
| CAT2 | 50 | 15% |
| DA1 | 10 | 10% |
| DA2 | 10 | 10% |
| DA3 | 10 | 10% |
| FAT | 100 | 40% |

Each component contributes `raw mark / raw maximum × course weight`; ungraded
components are excluded from earned points and are estimated from the section
mean only in projected course totals. Z-scores and trajectories compare
weighted course points for students with the same completed components.

## Requirements

- Node.js 20.9 or newer (Node.js 24 LTS recommended).
- PostgreSQL 15 or newer, local or hosted.

## Setup

```powershell
npm ci
Copy-Item .env.example .env.local
```

Set `DATABASE_URL`, `DIRECT_URL`, a generated `AUTH_SECRET`, and a local `DEMO_PASSWORD` in `.env.local`. Create the PostgreSQL database, then apply the included migration and seed the demo accounts:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000.

## Demo credentials

All seeded accounts use the `DEMO_PASSWORD` configured locally before running the seed. The password is not stored in the repository; the seed stores only a PBKDF2-SHA256 hash.

- Student registration number: `24BCE0001`
- Teacher: `dr.sharma@gradecurve.demo`
- Teacher: `ananya@gradecurve.demo`

## Quality commands

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The unit suite covers grading calculations and signed session behavior. The Playwright suite covers the landing and sign-in pages, unauthenticated route protection, role separation, and sign-out. Database-backed sign-in and dashboard flows need the configured PostgreSQL database to be running and seeded.

## Environment and secrets

`.env.local` and `.env` are ignored by Git. `.env.example` contains placeholders only. Do not commit passwords, database credentials, or authentication secrets.

## Relative grading language

GradeCurve reports analytical trajectories and simulations. They are not official university grades; official outcomes remain determined by institutional policy.

## Database-side retrieval experiment

The experimental branch adds `GET /api/student/assessment-summary`, backed by the PostgreSQL `student_assessment_summary` PL/pgSQL function. The endpoint requires a student session and uses the signed-in user's ID on the server. It returns each enrolled course's class slot, assessments, maximum marks, weights, and any recorded marks.

This experiment uses PostgreSQL PL/pgSQL. Oracle PL/SQL cannot run directly on PostgreSQL; Oracle support would require an Oracle-compatible database and a separate database integration.
