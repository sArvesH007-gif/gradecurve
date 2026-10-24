import dotenv from "dotenv";
import neo4j from "neo4j-driver";

dotenv.config({ path: ".env.local" });

const uri = process.env.NEO4J_URI;
const username = process.env.NEO4J_USERNAME;
const password = process.env.NEO4J_PASSWORD;
if (!uri || !username || !password) {
  throw new Error(
    "Set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD in .env.local.",
  );
}

const driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
const database = process.env.NEO4J_DATABASE || "neo4j";
const session = driver.session({ database });

const students = [
  {
    id: "demo-student-001",
    alias: "Demo Learner A",
    slot: "DA3 Demo Slot",
    needs: ["Algorithms", "Database Design"],
    helps: ["Web Development"],
  },
  {
    id: "demo-student-002",
    alias: "Demo Learner B",
    slot: "DA3 Demo Slot",
    needs: ["Web Development"],
    helps: ["Algorithms", "SQL"],
  },
  {
    id: "demo-student-003",
    alias: "Demo Learner C",
    slot: "DA3 Demo Slot",
    needs: ["SQL"],
    helps: ["Database Design"],
  },
  {
    id: "demo-student-004",
    alias: "Demo Learner D",
    slot: "DA3 Demo Slot",
    needs: ["Algorithms"],
    helps: ["Database Design", "Web Development"],
  },
  {
    id: "demo-student-005",
    alias: "Demo Learner E",
    slot: "DA3 Demo Slot",
    needs: ["Database Design"],
    helps: ["SQL"],
  },
  {
    id: "demo-student-006",
    alias: "Demo Learner F",
    slot: "DA3 Demo Slot",
    needs: ["Web Development"],
    helps: ["Algorithms"],
  },
];

try {
  await session.run(
    "CREATE CONSTRAINT student_id IF NOT EXISTS FOR (n:Student) REQUIRE n.id IS UNIQUE",
  );
  await session.run(
    "CREATE CONSTRAINT course_id IF NOT EXISTS FOR (n:Course) REQUIRE n.id IS UNIQUE",
  );
  await session.run(
    "CREATE CONSTRAINT topic_id IF NOT EXISTS FOR (n:Topic) REQUIRE n.id IS UNIQUE",
  );
  await session.run(
    "CREATE CONSTRAINT class_slot_id IF NOT EXISTS FOR (n:ClassSlot) REQUIRE n.id IS UNIQUE",
  );

  await session.run(
    "MERGE (c:Course {id: $id}) SET c.code = $code, c.name = $name",
    {
      id: "demo-course-cs301",
      code: "CS301",
      name: "Data Structures and Databases",
    },
  );
  await session.run("MERGE (s:ClassSlot {id: $id}) SET s.name = $name", {
    id: "demo-slot-da3",
    name: "DA3 Demo Slot",
  });
  await session.run(
    "UNWIND $topics AS topic MERGE (t:Topic {id: topic.id}) SET t.name = topic.name",
    {
      topics: ["Algorithms", "Database Design", "SQL", "Web Development"].map(
        (name) => ({ id: name.toLowerCase().replaceAll(" ", "-"), name }),
      ),
    },
  );
  await session.run(
    `UNWIND $students AS row
     MERGE (s:Student {id: row.id}) SET s.alias = row.alias, s.synthetic = true
     WITH s, row
     MATCH (c:Course {id: 'demo-course-cs301'}), (slot:ClassSlot {id: 'demo-slot-da3'})
     MERGE (s)-[:ENROLLED_IN]->(c)
     MERGE (s)-[:BELONGS_TO]->(slot)
     WITH s, row
     UNWIND row.needs AS topicName
     MATCH (t:Topic {name: topicName})
     MERGE (s)-[:NEEDS_HELP_WITH]->(t)`,
    { students },
  );
  await session.run(
    `MATCH (a:Student {id: 'demo-student-002'}), (b:Student {id: 'demo-student-003'})
     MERGE (a)-[:STUDIES_WITH {context: 'synthetic demo'}]-(b)`,
  );
  await session.run(
    `UNWIND $students AS row
     MATCH (s:Student {id: row.id})
     UNWIND row.helps AS topicName
     MATCH (t:Topic {name: topicName})
     MERGE (s)-[:CAN_HELP_WITH]->(t)`,
    { students },
  );

  const count = await session.run(
    "MATCH (s:Student {synthetic: true}) RETURN count(s) AS count",
  );
  console.log(
    `Neo4j seed complete: ${count.records[0]?.get("count").toString()} synthetic students.`,
  );
} finally {
  await session.close();
  await driver.close();
}
