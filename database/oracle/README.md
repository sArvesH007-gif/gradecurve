# GradeCurve DA2 Oracle SQL and PL/SQL

Oracle Database Free 26ai is the active relational store for the integrated DA2/DA3 application. PostgreSQL/Prisma schema, migrations, and seed code remain in the repository as historical reference; active pages and API routes no longer connect to PostgreSQL. Neo4j is a separate graph store for synthetic relationship demonstrations.

Oracle SQL and PL/SQL are a separate dialect from the existing PostgreSQL SQL and PL/pgSQL routines. The files here use Oracle identity columns, `VARCHAR2`, `NUMBER`, `DATE`, `MERGE`, SQL*Plus script syntax, PL/SQL blocks, package definitions, cursors, `DBMS_OUTPUT`, and Oracle exceptions. They do not use PostgreSQL-only SQL or PL/pgSQL.

## Oracle Database Free container

The Oracle registry currently publishes Oracle AI Database 26ai Free as the official `container-registry.oracle.com/database/free:latest` image. Oracle Registry access may require signing in and accepting its terms before a pull succeeds. This project uses the Full image, a project-specific container and named volume, and host port **1522** because port 1521 is already occupied on the inspected host. The container listens on its own port 1521. The Compose file is isolated from the existing PostgreSQL/Neo4j Compose project.

The host inspection found 16 CPUs, about 16 GiB physical RAM, about 7.6 GiB Docker memory, and about 335 GiB free on C:. PostgreSQL and Neo4j were already running and were not changed. The Oracle service is capped at 4 GiB RAM. Oracle's published Free requirements were met by the available Docker memory and disk at inspection time.

Create an ignored local environment file at the repository root named `.env.oracle.local`:

```dotenv
ORACLE_PWD="choose-a-unique-Oracle-system-password"
ORACLE_HOST_PORT=1522
```

Use an Oracle-valid password of 8–30 characters with letters and numbers. Do not commit this file. The provided `.gitignore` excludes `.env.*` files. The Oracle container initializes the `FREEPDB1` PDB and persists data in the independent `gradecurve-oracle-data` volume.

Sign in to Oracle Container Registry and accept the image terms if Oracle requests it. Start only the Oracle Compose project:

```powershell
docker compose --project-name gradecurve-oracle -f database/oracle/docker-compose.yml --env-file .env.oracle.local up -d
docker logs -f gradecurve-oracle-free
```

Wait for `DATABASE IS READY TO USE!` and the Docker health check to become healthy. The published port binds to host loopback (`127.0.0.1:1522` by default), and the health check uses `FREEPDB1` over the container's loopback listener. Then install the schema and fixture data into the dedicated `SYSTEM` demo schema:

```powershell
docker exec gradecurve-oracle-free sh -lc 'sqlplus -L -S system/"$ORACLE_PWD"@//localhost:1521/FREEPDB1 @/opt/oracle/project/00_setup.sql'
```

The scripts are bind-mounted read-only into the container. `00_setup.sql` is for a fresh empty Oracle schema; it is not an idempotent reset script. Do not run it a second time over an already installed schema. This `SYSTEM` account is only for the local academic demonstration. The health check expands `ORACLE_PWD` for SQL*Plus inside the container; container administrators can inspect environment or process state. For deployment, create a least-privilege Oracle schema, grant only the application permissions it needs, and use a managed secret or Oracle wallet instead of `SYSTEM` credentials.

After installation, run the SQL and PL/SQL demonstration:

```powershell
docker exec -it gradecurve-oracle-free sh -lc 'sqlplus -L -S system/"$ORACLE_PWD"@//localhost:1521/FREEPDB1 @/opt/oracle/project/11_demo_execution.sql'
```

The demo executes all 12 distinct read queries, prints summary and cursor output, updates one seeded mark and attendance row, tests a safe create/delete of an unused course, demonstrates four handled exception cases, and displays the audit rows and table counts. The mark update and attendance update are intentional persistent examples; the temporary course is removed by the validated procedure. Do not run against production data.

To stop the Oracle-only service while retaining its database files:

```powershell
docker compose --project-name gradecurve-oracle -f database/oracle/docker-compose.yml --env-file .env.oracle.local down
```

Do not add `--volumes` / `-v` unless you explicitly intend to erase the Oracle demo database. The commands above do not stop or remove PostgreSQL, Neo4j, or their volumes.

## Schema mapping

The Oracle schema represents the 14 GradeCurve Prisma models with Oracle naming and types: `USERS`, `STUDENT_PROFILES`, `TEACHER_PROFILES`, `COURSES`, `CLASS_SLOTS`, `COURSE_SLOTS`, `ENROLLMENTS`, `ASSESSMENTS`, `MARKS`, `MARK_SUBMISSIONS`, `MARK_VERIFICATIONS`, `ATTENDANCE`, `STUDY_MATCHES`, and `GUIDANCE_ALERTS`. Identity keys, foreign keys, uniqueness, validation checks, and lookup indexes are installed in files 01 and 02. `MARK_AUDIT` is the one additional table required to retain the old/new mark values written by the update trigger.

The sample data uses fictional `Demo Student NN` names and the existing GradeCurve courses and registration-number pattern. Each course gets the confirmed six assessment components: CAT1 15% of 50, CAT2 15% of 50, DA1 10% of 10, DA2 10% of 10, DA3 10% of 10, and FAT 40% of 100. Weights are fractions summing to 1.0; a weighted assessment contributes `raw score / maximum raw score * weight * 100` points.

Expected seeded counts before the update demo: 47 users, 45 students, 2 teachers, 2 courses, 3 class slots, 6 offerings, 90 enrollments, 12 assessments, 531 marks (including one approved fallback), 5 submissions, 1 verification, 1,080 attendance rows, 1 study match, and 3 guidance alerts. `MARK_AUDIT` starts empty and gains a row after the mark update demonstration.

## SQL query set

`04_sql_queries.sql` implements **12 distinct Oracle `SELECT` queries**. It uses SQL*Plus substitution variables for its fictional demo inputs, so the examples can be changed without editing query logic.

| Query | Purpose |
|---|---|
| Q1 | Student details and active class slot |
| Q2 | Course enrollments, slots, and assigned faculty |
| Q3 | Per-course student attendance counts and percentage |
| Q4 | Assessment raw marks, maximum marks, weights, and percentages |
| Q5 | Course assessment mean, population deviation, range, and count |
| Q6 | One student's weighted performance and graded weight |
| Q7 | Roster for a course and slot |
| Q8 | Students below 75% attendance |
| Q9 | Missing assessment marks |
| Q10 | Course-wide student weighted performance and attendance summary |
| Q11 | Pending faculty mark-verification queue |
| Q12 | Course offerings, faculty, slots, and roster counts |

Run all twelve from SQL*Plus with `@11_demo_execution.sql`. On the seeded fixture, Q1 returns one student, Q2 two courses, Q3 two attendance summaries, Q7 fifteen students in the selected slot, Q8 identifies the low-attendance fixture students, Q9 finds the intentionally ungraded FAT marks, Q11 returns four pending submissions, and Q12 returns three slot rows for the course. Other queries return the selected student's marks or course statistics. Exact values are computed by the SQL from the inserted fixture.

## Oracle PL/SQL work

- **Procedures:** `upsert_assessment_mark` validates course ownership, student enrollment, and raw score range before `MERGE`; `record_course_attendance` validates teacher/enrollment and merges attendance; `generate_student_academic_summary` prints course totals for any student ID; `delete_empty_course` permits deletion only when the course has no learner activity; `delete_empty_student` only deletes an inactive profile in the teacher's slots.
- **Functions:** `weighted_course_score`, `course_attendance_percent`, and `academic_performance_status` calculate GradeCurve weighted points, attendance percentage, and performance status for supplied IDs.
- **Conditionals:** `academic_performance_status` uses `IF` / `ELSIF` / `ELSE`; PL/SQL and SQL demonstrations use `CASE` expressions.
- **Cursors:** `print_course_students_explicit` opens/fetches/closes an explicit cursor; `print_course_students_for_loop` uses a cursor FOR loop; `print_course_slot_students` declares a parameterized cursor. The academic summary procedure also iterates a query cursor FOR loop.
- **Trigger:** `marks_score_audit_trg` runs after a mark score changes and writes mark/student/assessment IDs, old score, new score, `UPDATE` action, timestamp, and actor into `MARK_AUDIT`.
- **Exceptions:** `10_exception_handling.sql` demonstrates `NO_DATA_FOUND`, `TOO_MANY_ROWS`, `DUP_VAL_ON_INDEX`, and a custom `RAISE_APPLICATION_ERROR`.
- **Package:** `GRADECURVE_ACADEMIC_PKG` exposes four reusable procedures and three functions. The package body delegates to the validated standalone routines, keeping one implementation of each rule.

All procedures, functions, cursor routines, package methods, and queries take IDs or caller data as parameters. The only fixed IDs in the demo execution sequence are looked up from the fictional seed rows; the business procedures do not assume a particular student or course.

## Next.js Oracle backend and faculty CRUD demo

The Oracle integration is isolated under `lib/oracle/` and `/api/oracle/`. It uses the official `node-oracledb` driver in Thin mode with a server-side connection pool and bound values. It does not configure Prisma to use Oracle and does not expose Oracle credentials to client code.

The Oracle faculty page is `/teacher/oracle`. Sign-in now looks up student and faculty accounts in Oracle and verifies salted PBKDF2-SHA256 password hashes. The existing signed, HTTP-only, same-site 12-hour session cookie and role checks are retained. Oracle requests map the session's Oracle user ID and username to the correct faculty row and enforce course/slot ownership. The workspace reads Oracle student/course/assessment/mark data; inserts students, courses, and assessments; updates marks and attendance through PL/SQL routines; and deletes only unused courses or empty students through guarded procedures. Student passwords are hashed before insertion. A student with marks, attendance, submissions, matches, or guidance activity cannot be deleted.

Set the following in the ignored `.env.local` file used by Next.js. For the local container demo, the Oracle account is `SYSTEM`; use the same local password set for `ORACLE_PWD` above. These are server-only variables:

```dotenv
ORACLE_USER=SYSTEM
ORACLE_PASSWORD="same-local-Oracle-system-password"
ORACLE_CONNECT_STRING=localhost:1522/FREEPDB1
```

Provision the synthetic Oracle account password hashes once after schema setup:

```powershell
npm.cmd run db:provision-oracle-demo
```

This command reads `DEMO_PASSWORD` from `.env.local`, generates a distinct salted PBKDF2-SHA256 hash for each placeholder account, and updates only rows with `DEMO_ONLY_NO_LOGIN`. It does not save the plain-text password. Then start the app with `npm.cmd run dev` and sign in using the local `DEMO_PASSWORD`. PostgreSQL is not required by the active application's normal runtime.

## Verification history

### Original DA2 Oracle SQL/PLSQL implementation

- Oracle AI Database Free 26ai ran in the isolated `gradecurve-oracle-free` container on host port 1522. The Oracle data uses its own named volume; the existing PostgreSQL and Neo4j services and volumes were not changed.
- `00_setup.sql` created 15 tables, seeded the fixtures, and installed the SQL and PL/SQL objects. `12_verify_install.sql` returned no invalid objects, compiler errors, or assessment weight errors.
- `11_demo_execution.sql` completed against Oracle, executing all 12 read queries, PL/SQL demonstrations, audit trigger, and temporary course create/delete flow. Captured original DA2 output is in `verified-output.txt`.
- The initial DA2 browser run passed six tests, including course insertion/deletion, assessment insertion, mark update, and attendance update. At that point `npm.cmd run typecheck` was blocked by stale generated `.next` types referring to the DA3-only study-partners route, which was not part of the DA2 checkpoint.

### Later DA3 Oracle + Neo4j integration

- DA3 typecheck, lint, unit tests, Playwright tests, Oracle connectivity, and Neo4j verification passed on the integrated DA3 branch; detailed results are in [`../../docs/da3/verified-output.md`](../../docs/da3/verified-output.md).
- The DA3 production build was verified successfully in a temporary copy outside OneDrive at `C:\dev\gradecurve-da3-security-check`. This avoided OneDrive cleanup `EPERM` and left the original `.next` output untouched.
- DA3 adds tested Oracle student creation and guarded student deletion alongside course, assessment, marks, and attendance flows. DA3 also connects Oracle authentication to student/faculty dashboards and tests the synthetic Neo4j recommendation service.

The earlier DA2 typecheck limitation describes only the DA2 checkpoint state; it is not the result of the later DA3 verification. The `SYSTEM` account and password-based local health check above are for this isolated demonstration, not deployment.
