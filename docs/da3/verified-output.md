# DA3 verification results

Verified locally on 2026-11-01 on branch `da3/oracle-neo4j`. The working tree was not committed.

## Oracle

```text
node database/oracle/driver-smoke.mjs: passed
node-oracledb Thin mode: true
Oracle version: 23.26.3.0.0
Connected service: FREEPDB1
```

The live Oracle student and faculty sign-in flows loaded their respective dashboards. Playwright tested student creation with a salted PBKDF2 password hash, then student deletion through the PL/SQL guard that permits only an empty student. It also created a course and verified guarded deletion, created an assessment, and inserted/updated a mark and attendance row. The guard rejected deletion when the student/course had dependent academic activity. Existing DA2 setup and PL/SQL demonstration output remains in `database/oracle/verified-output.txt`; schema-creation scripts were not rerun against the already populated database.

## Neo4j

```text
npm.cmd run db:seed:neo4j: passed; 6 synthetic students seeded
npm.cmd run db:verify:neo4j: passed; connected=true
CRUD: created "CRUD Demo", updated to "CRUD Demo Updated", deletedCount=0
Traversal: Demo Learner A / CS301 / DA3 Demo Slot
Needs: Database Design and Algorithms
Recommendations: Demo Learners B, C, D, and F
```

The verification script connects with the official Neo4j JavaScript driver. Seed data uses stable IDs, uniqueness constraints, and `MERGE`. The protected API is covered by tests for 401 unauthenticated, 403 teacher, 200 student with `syntheticDemo: true`, and safe 503 graph-service failure.

## Application checks

```text
npm.cmd run typecheck: passed
npm.cmd run lint: passed
npm.cmd test: passed (Vitest 4.1.12; 5 files, 22 tests)
npm.cmd run test:e2e: passed (8 tests)
  - anonymous and tampered sessions rejected
  - student/faculty role separation and sign-out
  - Oracle student and faculty sign-in, dashboards, and sign-out
  - Oracle student create/delete with database safeguards, course create/guarded delete, assessment creation, mark update, and attendance update
```

The browser tests use the `localhost` origin so session cookies remain on the same host across the login redirect.

## Production build

The source tree is under OneDrive, so the production build was checked in a temporary copy at `C:\dev\gradecurve-da3-security-check`, excluding `.git`, `node_modules`, Next output, and test artifacts. The copy included ignored environment files for local build configuration; their contents were not printed. The build completed outside OneDrive and left the original `.next` output untouched.

```text
npm.cmd ci: passed (577 packages installed)
npm.cmd run typecheck: passed
npm.cmd run lint: passed
npm.cmd run build: passed
Next.js 16.4.3: production compilation passed; 23 static pages generated
```

The post-remediation install reported 17 moderate audit paths, all from the ESLint/minimatch development toolchain; `npm audit --omit=dev --prefer-online` found no production vulnerabilities. The install skipped unapproved package scripts. The app's Oracle driver verification succeeded in Thin mode. The original `.next` directory was not deleted or cleaned by the verification build.

The security remediation moved Next.js and `eslint-config-next` from 16.3.8 to 16.4.3, Zod from 4.6.5 to 4.6.7, Prisma packages from 7.10.0 to 7.10.1, Vitest from 3.2.7 to 4.1.12, and Vite to patched 7.3.7. The remaining moderate finding is `minimatch` below 11.0.1 in the ESLint dependency tree; no forced ESLint or dependency-major override was applied.

## Scope limits

- Graph suggestions are synthetic and use a fixed fictional requester; they do not use Oracle student identity or marks.
- No automatic Oracle-to-Neo4j synchronization is implemented.
- PostgreSQL and Prisma code remains as historical reference and is not used by active app pages or API routes.
- Oracle installation scripts were not rerun against the populated database during this verification to avoid recreating initialized schema objects.
