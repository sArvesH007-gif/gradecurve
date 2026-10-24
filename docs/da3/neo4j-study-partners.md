# DA3: Neo4j study-partner graph

## Why Neo4j

Study-partner discovery depends on traversing connected facts: a student's course and class slot, the topics they need, and the topics another student can teach. Neo4j makes those paths and the matching traversal explicit. PostgreSQL remains the system of record for users, marks, courses, enrollment, and attendance; Prisma remains its ORM. Neo4j is an additional projection for this relationship-centered demonstration, not a universal replacement for relational databases.

## Graph model

Stable identifiers are constrained as unique. All seeded nodes are synthetic and contain no names, registration numbers, marks, credentials, or other real student information.

| Node        | Stable key | Properties           |
| ----------- | ---------- | -------------------- |
| `Student`   | `id`       | `alias`, `synthetic` |
| `Course`    | `id`       | `code`, `name`       |
| `Topic`     | `id`       | `name`               |
| `ClassSlot` | `id`       | `name`               |

Relationships: `(Student)-[:ENROLLED_IN]->(Course)`, `(Student)-[:BELONGS_TO]->(ClassSlot)`, `(Student)-[:NEEDS_HELP_WITH]->(Topic)`, `(Student)-[:CAN_HELP_WITH]->(Topic)`, and `(Student)-[:STUDIES_WITH]-(Student)`.

`GET /api/student/study-partners` requires the existing signed-in `STUDENT` session. It returns only pseudonymous demo labels and matched topic names. It currently uses the fixed synthetic requester `demo-student-001`; recommendations are therefore clearly marked as sample results and are not personalized to the logged-in account. The graph has no student marks or personally identifying data.

## Synthetic sample data

The repeatable seed creates one course (`CS301`), one class slot, four topic nodes, and six fictional student nodes. The fixed requester needs Algorithms and Database Design. Other demo students have overlapping help skills, allowing the graph query to rank candidates by the number of complementary topics. Re-running the seed uses `MERGE` and does not duplicate nodes or relationships.

## Local setup

Requirements: Node.js 20.9+, Docker Desktop with Compose, and the existing PostgreSQL setup for signing into the dashboard.

1. Install project dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` if needed. Set `NEO4J_PASSWORD` to a local password, and ensure `NEO4J_URI=bolt://localhost:7687`, `NEO4J_USERNAME=neo4j`, and `NEO4J_DATABASE=neo4j`. Keep `.env.local` untracked.
3. Start Neo4j with `docker compose --env-file .env.local up -d neo4j`.
4. Import sample data with `npm run db:seed:neo4j`.
5. Verify graph connection, CRUD, traversal, and recommendations with `npm run db:verify:neo4j`.
6. Start the existing PostgreSQL-backed app with `npm run dev`, sign in as a seeded student, and open the dashboard. The sample graph results appear under “Graph study-partner suggestions.”

Neo4j Browser is available at http://localhost:7474. Connect with the credentials configured above. Stop the service with `docker compose --env-file .env.local down`; its local data remains in the `neo4j_data` volume. To reset the synthetic database, use `docker compose --env-file .env.local down -v` and seed again.

## Query/API behavior

The API returns HTTP 401 without a valid session, 403 for non-student roles, 200 with recommendations when Neo4j is available, and 503 with a safe generic message for configuration or connection errors. Connection secrets and raw driver errors are never returned to callers.

## PostgreSQL and Neo4j for this feature

| Concern                                     | PostgreSQL + Prisma                             | Neo4j                                                                                  |
| ------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Existing student and grading records        | Primary relational system of record             | Not copied into the DA3 demo graph                                                     |
| Course enrollment and class membership      | Normalized tables and joins                     | Direct typed relationships                                                             |
| Topic compatibility traversal               | Multiple joins or recursive SQL as paths deepen | Pattern matching across topic and class/course relationships                           |
| Transactional academic data and constraints | Strong fit; already implemented                 | Useful as a graph projection, but not needed for marks or core CRUD                    |
| DA3 rationale                               | Preserved for core app data                     | Selected because connected needs/skills and traversal are central to partner discovery |

This small synthetic example is a teaching demonstration; it does not claim Neo4j is always faster or better than PostgreSQL.

## Verification record

See [verified-output.md](./verified-output.md). Outputs should be recorded only after running the service, seed, query, and route checks locally. If Docker or Neo4j is unavailable, the implementation and setup remain ready, but live execution must be reported as unverified.
