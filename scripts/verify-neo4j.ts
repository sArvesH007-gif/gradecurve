import dotenv from "dotenv";
import neo4j from "neo4j-driver";

dotenv.config({ path: ".env.local" });

const { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } = process.env;
if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
  throw new Error(
    "Set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD in .env.local.",
  );
}

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
);
const session = driver.session({
  database: process.env.NEO4J_DATABASE || "neo4j",
});

try {
  const health = await session.run("RETURN 1 AS connected");
  const studentCount = await session.run(
    "MATCH (s:Student {synthetic: true}) RETURN count(s) AS count",
  );

  await session.run("MATCH (t:Topic {id: 'crud-demo-topic'}) DELETE t");
  await session.run(
    "CREATE (:Topic {id: 'crud-demo-topic', name: 'CRUD Demo'})",
  );
  const created = await session.run(
    "MATCH (t:Topic {id: 'crud-demo-topic'}) RETURN t.name AS name",
  );
  await session.run(
    "MATCH (t:Topic {id: 'crud-demo-topic'}) SET t.name = 'CRUD Demo Updated'",
  );
  const updated = await session.run(
    "MATCH (t:Topic {id: 'crud-demo-topic'}) RETURN t.name AS name",
  );
  await session.run("MATCH (t:Topic {id: 'crud-demo-topic'}) DELETE t");
  const deleted = await session.run(
    "MATCH (t:Topic {id: 'crud-demo-topic'}) RETURN count(t) AS count",
  );

  const traversal = await session.run(
    `MATCH (s:Student {id: 'demo-student-001'})-[:ENROLLED_IN]->(c:Course),
           (s)-[:BELONGS_TO]->(slot:ClassSlot),
           (s)-[:NEEDS_HELP_WITH]->(topic:Topic)
     RETURN s.alias AS requester, c.code AS course, slot.name AS slot,
            collect(DISTINCT topic.name) AS needs`,
  );
  const recommendations = await session.run(
    `MATCH (requester:Student {id: 'demo-student-001'})-[:ENROLLED_IN]->(course:Course),
           (requester)-[:BELONGS_TO]->(slot:ClassSlot),
           (requester)-[:NEEDS_HELP_WITH]->(topic:Topic)<-[:CAN_HELP_WITH]-(candidate:Student),
           (candidate)-[:ENROLLED_IN]->(course),
           (candidate)-[:BELONGS_TO]->(slot)
     WHERE candidate.id <> requester.id AND candidate.synthetic = true
     WITH candidate, course, collect(DISTINCT topic.name) AS topics
     RETURN candidate.alias AS partner, course.code AS course, topics
     ORDER BY size(topics) DESC, partner`,
  );

  console.log(
    JSON.stringify(
      {
        connected: health.records[0]?.get("connected").toNumber() === 1,
        syntheticStudents: studentCount.records[0]?.get("count").toNumber(),
        crud: {
          created: created.records[0]?.get("name"),
          updated: updated.records[0]?.get("name"),
          deletedCount: deleted.records[0]?.get("count").toNumber(),
        },
        traversal: traversal.records.map((record) => ({
          requester: record.get("requester"),
          course: record.get("course"),
          slot: record.get("slot"),
          needs: record.get("needs"),
        })),
        recommendations: recommendations.records.map((record) => ({
          partner: record.get("partner"),
          course: record.get("course"),
          topics: record.get("topics"),
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await session.close();
  await driver.close();
}
