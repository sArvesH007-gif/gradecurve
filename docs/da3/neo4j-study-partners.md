# DA3: Oracle + Neo4j integration

## Final architecture

The active GradeCurve application uses Oracle Database Free 26ai as its relational system of record and Neo4j 5 Community for the separate graph demonstration.

| Area | Primary responsibility | Access path |
| --- | --- | --- |
| Oracle | Users and account lookup, student/faculty profiles, courses, slots, enrollments, assessments, all marks, attendance, calculations, submissions, verifications, matches, alerts | Server-side `node-oracledb` Thin driver, pooled connections, bound Oracle SQL, PL/SQL routines, transactions |
| Neo4j | Synthetic student/course/topic/class-slot relationships and graph traversal | Official `neo4j-driver`, parameterized Cypher, server-side route and seed/verify scripts |
| Next.js | Protected server-rendered dashboards and TypeScript APIs | Signed session cookies, role checks, server-only database modules |

PostgreSQL and Prisma code, migrations, and seed scripts remain in the repository as historical reference. Active pages and APIs do not import the Prisma client or use `DATABASE_URL`; the old `db:migrate` and `db:seed` commands are legacy-only. The production build may generate the preserved Prisma client for reference code, but it does not connect to PostgreSQL.

Oracle and Neo4j have separate responsibilities. Oracle owns all academic and account data. Neo4j is not a second academic store. No password, token, real student name, registration number, mark, or other confidential Oracle value is written to the graph.

## Database comparison

| Database | Strength used in this project | DA3 role | Scope boundary |
| --- | --- | --- | --- |
| Oracle Database Free 26ai | Relational constraints, transactions, SQL reporting, and PL/SQL routines for academic records | Active source of truth for accounts and all relational GradeCurve operations | Requires the local Oracle service and environment-based credentials |
| Neo4j 5 Community | Explicit relationship modeling and Cypher path traversal across students, courses, topics, and class slots | Active graph service for the synthetic study-partner demonstration | Contains only six synthetic graph learners; no Oracle student or marks synchronization |
| PostgreSQL | Relational storage and Prisma migrations from the earlier implementation | Preserved historical reference; not used by active pages or APIs | Legacy migration/seed commands and client dependencies remain in the repository |

These systems serve different data and query needs. This project makes no blanket performance ranking between them.

## Why Neo4j

Study-partner examples are naturally expressed as paths among a student, course, class slot, and complementary topic skills. Neo4j makes those relationships and traversals explicit. It is selected for this graph-shaped task; this is not a claim that Neo4j is universally faster or better than Oracle or PostgreSQL.

## Graph schema

All nodes use stable `id` properties protected by uniqueness constraints.

| Node | Properties | Meaning |
| --- | --- | --- |
| `Student` | `id`, `alias`, `synthetic` | Fictional graph learner; no Oracle student identity |
| `Course` | `id`, `code`, `name` | Synthetic course used in the recommendation fixture |
| `Topic` | `id`, `name` | Skill or topic |
| `ClassSlot` | `id`, `name` | Synthetic shared class cohort |

Relationships:

- `(Student)-[:ENROLLED_IN]->(Course)`
- `(Student)-[:BELONGS_TO]->(ClassSlot)`
- `(Student)-[:NEEDS_HELP_WITH]->(Topic)`
- `(Student)-[:CAN_HELP_WITH]->(Topic)`
- `(Student)-[:STUDIES_WITH]-(Student)`

The fixture includes six fictional graph learners, one sample course, one slot, and four topics. Seed runs use `MERGE` and can be repeated without duplicating nodes or relationships. The seed and verification implementation are in `scripts/seed-neo4j.ts` and `scripts/verify-neo4j.ts`; runnable Cypher CRUD, traversal, and recommendation examples are in `docs/da3/demo.cypher`.

## Recommendation behavior and privacy boundary

`GET /api/student/study-partners` requires a signed-in `STUDENT` session. It returns HTTP 401 for no session, 403 for a teacher session, 200 with a `syntheticDemo: true` marker, or a safe HTTP 503 response when Neo4j is unavailable. Raw driver errors and credentials are not sent to the browser.

Recommendations use the fixed fictional requester `demo-student-001`, require a shared course and slot, and rank synthetic candidates by complementary `NEEDS_HELP_WITH` / `CAN_HELP_WITH` topics. The dashboard keeps the **Synthetic demo** label. It does not use the logged-in Oracle student's identity or academic marks. There is no automatic Oracle-to-Neo4j synchronization; introducing an approved pseudonymous ID mapping and consented synchronization process is future work.

## Oracle authentication and academic features

Student and faculty login queries `USERS` in Oracle and verifies PBKDF2-SHA256 hashes with unique salts. Existing signed HTTP-only, same-site session cookies and role checks are retained. Account hashes are provisioned locally from `DEMO_PASSWORD` with `npm.cmd run db:provision-oracle-demo`; the plain-text password is not stored in Oracle.

Student and faculty pages, student/course/assessment CRUD, fallback submissions, study-match requests, batch marks, course statistics, guidance alerts, and verifications use Oracle SQL or PL/SQL. New student passwords are hashed before insertion, and deletion calls the guarded `gradecurve_academic_pkg.remove_empty_student` procedure, which rejects students with academic or support activity. `node-oracledb` is not configured through Prisma. GradeCurve weights remain CAT1 15%, CAT2 15%, DA1 10%, DA2 10%, DA3 10%, FAT 40%; the FAT weight is 40%.

## Docker and environment

The root `docker-compose.yml` defines the same `dbslab` Neo4j project/service and the existing `dbslab_neo4j_data` / `dbslab_neo4j_logs` named volumes. Neo4j's host ports 7474 and 7687 bind to `127.0.0.1`; the Oracle host port 1522 also binds to loopback. The Neo4j health check authenticates with environment-provided credentials and executes `RETURN 1`. The current Neo4j and Oracle health checks pass passwords to their client commands inside the containers, where a container administrator may inspect process arguments or environment. This is acceptable only for the local demo; use managed secrets and a least-privilege account for deployed services. Starting or stopping services does not use `down -v` and does not delete graph data.

Oracle remains in `database/oracle/docker-compose.yml`, project `gradecurve-oracle`, container `gradecurve-oracle-free`, host port 1522, service `FREEPDB1`, and volume `gradecurve-oracle-data`. PostgreSQL's existing container and volume are preserved and are not required by the active app.

Set app values in ignored `.env.local`, `ORACLE_PWD` in `.env.oracle.local` for the Oracle container, and only the Neo4j Docker credential values in `.env.neo4j.local`:

```dotenv
AUTH_SECRET=use-a-random-secret-of-at-least-32-characters
DEMO_PASSWORD=choose-a-local-demo-login-password
ORACLE_USER=SYSTEM
ORACLE_PASSWORD=local-oracle-password
ORACLE_CONNECT_STRING=localhost:1522/FREEPDB1
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_DATABASE=neo4j
```

The Compose file `.env.neo4j.local` must contain `NEO4J_USERNAME` and `NEO4J_PASSWORD`, matching the existing Neo4j instance. Never commit these values. `.env.example` contains placeholders only.

## Setup and demonstration

```powershell
npm.cmd ci
docker compose --project-name gradecurve-oracle -f database/oracle/docker-compose.yml --env-file .env.oracle.local up -d
docker compose --project-name dbslab --env-file .env.neo4j.local up -d neo4j
npm.cmd run db:provision-oracle-demo
npm.cmd run db:seed:neo4j
npm.cmd run db:verify:neo4j
npm.cmd run dev
```

Use the local `DEMO_PASSWORD` to sign in as student `24BCE0001` or faculty `dr.sharma@gradecurve.demo`. The student dashboard shows Oracle academic analytics alongside the clearly labeled synthetic graph suggestions. The faculty dashboard reads and updates Oracle academic records.

Stop only the services when finished, retaining both databases:

```powershell
docker compose --project-name gradecurve-oracle -f database/oracle/docker-compose.yml --env-file .env.oracle.local down
docker compose --project-name dbslab --env-file .env.neo4j.local down
```

Do not add `-v`/`--volumes` unless intentionally deleting local database data.

## Verification and limitations

Current DA3 verification results, including actual command outcomes, are recorded in [verified-output.md](./verified-output.md). The populated Oracle instance was exercised through the driver smoke test, real sign-in/dashboard flows, and Oracle UI/API writes. Schema-creation scripts were not rerun against the already initialized instance; the DA2 installation and PL/SQL verification output remains in `database/oracle/verified-output.txt`.

Graph recommendations remain synthetic and unpersonalized. Database synchronization, production least-privilege Oracle/Neo4j accounts, and migration of existing PostgreSQL user records are outside the local demo's automatic setup; use the Oracle account fixture and explicit local password provisioning for demonstrations.
