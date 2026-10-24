import "server-only";
import { getNeo4jDatabase, getNeo4jDriver } from "@/lib/neo4j/driver";

export type StudyPartnerRecommendation = {
  partnerId: string;
  partnerLabel: string;
  courseCode: string;
  courseName: string;
  topics: string[];
};

export async function getDemoStudyPartnerRecommendations() {
  const driver = getNeo4jDriver();
  const session = driver.session({
    database: getNeo4jDatabase(),
    defaultAccessMode: "READ",
  });
  try {
    const result = await session.run(
      `MATCH (requester:Student {id: $requesterId})-[:ENROLLED_IN]->(course:Course),
             (requester)-[:BELONGS_TO]->(slot:ClassSlot),
             (requester)-[:NEEDS_HELP_WITH]->(topic:Topic)<-[:CAN_HELP_WITH]-(candidate:Student),
             (candidate)-[:ENROLLED_IN]->(course),
             (candidate)-[:BELONGS_TO]->(slot)
       WHERE candidate.id <> requester.id AND candidate.synthetic = true
       WITH candidate, course, collect(DISTINCT topic.name) AS topics
       RETURN candidate.id AS partnerId, candidate.alias AS partnerLabel,
              course.code AS courseCode, course.name AS courseName, topics
       ORDER BY size(topics) DESC, partnerLabel ASC
       LIMIT 5`,
      { requesterId: "demo-student-001" },
    );
    return result.records.map((record) => ({
      partnerId: record.get("partnerId") as string,
      partnerLabel: record.get("partnerLabel") as string,
      courseCode: record.get("courseCode") as string,
      courseName: record.get("courseName") as string,
      topics: record.get("topics") as string[],
    }));
  } finally {
    await session.close();
  }
}
