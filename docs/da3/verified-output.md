# DA3 verification output

Observed locally on 2026-10-24 using the Docker Compose Neo4j 5 Community instance and the official JavaScript driver:

```text
Connection: passed (RETURN 1 = 1)
Seed: passed; 6 synthetic students found
Repeatable seed: passed (uses MERGE and stable-ID constraints)
Repeat-seed check: passed; student count remained 6
Cypher CRUD: CREATE/READ returned "CRUD Demo"; UPDATE returned "CRUD Demo Updated"; DELETE left 0 matching nodes
Traversal: Demo Learner A / CS301 / DA3 Demo Slot; needs Algorithms and Database Design
Recommendations (ordered):
  Demo Learner B — Algorithms
  Demo Learner C — Database Design
  Demo Learner D — Database Design
  Demo Learner F — Algorithms
```

No real student data or marks were present in the graph output.

Protected API checks:

```text
Live unauthenticated GET /api/student/study-partners: HTTP 401
Live short-lived synthetic student session GET: HTTP 200, syntheticDemo=true, 4 pseudonymous recommendations
Vitest route checks: unauthenticated 401, teacher 403, student 200, graph failure 503
```

Final application checks:

```text
npm run typecheck: passed
npm run lint: passed
npm test: passed (5 files, 21 tests)
npm run build: passed (Next.js 16 production build)
Prettier check on the DA3 TypeScript, Markdown, and JSON files: passed
```
