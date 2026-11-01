# GradeCurve

GradeCurve is a relative-grading application built with Next.js App Router, React, and TypeScript. Its active relational database is Oracle Database Free 26ai; Neo4j provides synthetic graph-based study-partner examples. The preserved PostgreSQL/Prisma implementation remains available for historical comparison and legacy experiments, but the active pages and APIs do not connect to PostgreSQL.

## Architecture

- **Frontend:** Next.js and React student and faculty dashboards.
- **Backend:** TypeScript route handlers and server components.
- **Relational system of record:** Oracle tables for users, student/faculty profiles, courses, slots, enrollments, assessments, marks, attendance, fallback submissions, verifications, study-match requests, and guidance alerts. Application access uses the official `node-oracledb` driver with a server-side pool, bound SQL values, and transactions for multi-step writes.
- **Graph database:** Neo4j stores a separate synthetic graph of students, courses, topics, and slots. Cypher handles graph CRUD, traversal, and the demo recommendations. No marks, credentials, real student names, or registration numbers are copied into Neo4j.
- **Authentication:** Account lookup and PBKDF2-SHA256 password verification use Oracle. The app retains signed, HTTP-only, same-site 12-hour session cookies and role checks. Passwords and session secrets remain in local environment variables.

Oracle remains authoritative for academic information. Neo4j is a teaching example for relationship traversal. The graph's fixed fictional requester is not mapped to a signed-in Oracle student and its results are always labeled **Synthetic demo**; there is no automatic cross-database synchronization.

## GradeCurve assessment structure

| Component | Raw maximum | Course weight |
| --- | ---: | ---: |
| CAT1 | 50 | 15% |
| CAT2 | 50 | 15% |
| DA1 | 10 | 10% |
| DA2 | 10 | 10% |
| DA3 | 10 | 10% |
| FAT | 100 | 40% |

Oracle stores weights as fractions. A recorded mark contributes `raw mark / raw maximum × weight × 100` points. Relative grading compares students in the same course and class slot using the existing shared-completion cohort rules.

## Local setup

Requirements: Node.js 20.9+, Docker Desktop with Compose, and the already initialized Oracle and Neo4j databases (or use the setup scripts below for fresh local databases).

1. Install locked dependencies and copy the environment template:

   ```powershell
   npm.cmd ci
   Copy-Item .env.example .env.local
   ```

2. Set `AUTH_SECRET` to a random value of at least 32 characters, `DEMO_PASSWORD` to a local demo account password, Oracle connection values (`ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING`), and Neo4j values (`NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`) in `.env.local`. Create ignored `.env.neo4j.local` with only `NEO4J_USERNAME` and `NEO4J_PASSWORD` for Docker Compose, matching the existing Neo4j credentials. Never commit these local environment files.

3. Start the existing Oracle and Neo4j services without deleting volumes:

   ```powershell
   docker compose --project-name gradecurve-oracle -f database/oracle/docker-compose.yml --env-file .env.oracle.local up -d
   docker compose --project-name dbslab --env-file .env.neo4j.local up -d neo4j
   ```

   Oracle uses host port 1522 and service `FREEPDB1`, persisting in `gradecurve-oracle-data`. The Neo4j Compose project keeps its existing `dbslab_neo4j_data` and `dbslab_neo4j_logs` volumes. The project reuses those services and does not start PostgreSQL.

4. On a fresh Oracle schema, run `database/oracle/00_setup.sql` using SQL*Plus as described in [the Oracle guide](database/oracle/README.md). Provision password hashes for the seeded demo accounts:

   ```powershell
   npm.cmd run db:provision-oracle-demo
   ```

   This reads `DEMO_PASSWORD` locally and stores a distinct PBKDF2-SHA256 hash per Oracle account; it never stores the plain-text password.

5. Seed and verify the synthetic Neo4j graph:

   ```powershell
   npm.cmd run db:seed:neo4j
   npm.cmd run db:verify:neo4j
   ```

6. Start GradeCurve and open http://localhost:3000:

   ```powershell
   npm.cmd run dev
   ```

Demo accounts include student `24BCE0001` and faculty `dr.sharma@gradecurve.demo`. Use the locally configured `DEMO_PASSWORD`. Oracle fixtures are synthetic `Demo Student NN` records; the graph contains six pseudonymous synthetic students.

## DA2 Oracle SQL and PL/SQL

The Oracle implementation includes 15 tables, synthetic data, 12 distinct SQL query examples, PL/SQL procedures/functions/cursors/package/trigger/exception examples, and a Next.js Oracle faculty CRUD workspace. See [database/oracle/README.md](database/oracle/README.md) for setup, schema mapping, demonstrations, and recorded live verification.

## DA3 graph integration

See [docs/da3/neo4j-study-partners.md](docs/da3/neo4j-study-partners.md) for the final database split, graph model, Cypher examples, API behavior, synchronization boundary, and demonstration steps. `GET /api/student/study-partners` requires a valid student session and returns the fixed synthetic recommendations with `syntheticDemo: true`.

## Historical PostgreSQL reference

The existing Prisma schema, migrations, PostgreSQL SQL/PL/pgSQL demonstrations, seed code, and connector dependencies remain in the repository for historical reference. `npm.cmd run db:migrate` and `npm.cmd run db:seed` are legacy-only and require PostgreSQL; the active GradeCurve login, dashboards, APIs, and normal runtime do not. The running PostgreSQL container and its volume are left intact.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

Database integration checks are `npm.cmd run db:verify:neo4j`, `npm.cmd run db:provision-oracle-demo`, and the Playwright student/faculty flows. Only report checks as passed after they have run against the relevant local service.

## Secrets and limitations

`.env.local`, `.env.oracle.local`, `.next`, and `node_modules` are ignored. `.env.example` contains placeholders only. Oracle and Neo4j credentials are server-side. Neo4j recommendations use six synthetic graph learners and a fixed fictional requester; they are not personalized with a real student's identity or academic records. Oracle-to-Neo4j synchronization is intentionally not implemented.

Relative grading projections and risk indicators are estimates; official outcomes remain determined by institutional policy.
