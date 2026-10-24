// Constraints used by the seed. These are repeatable.
CREATE CONSTRAINT student_id IF NOT EXISTS FOR (n:Student) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT course_id IF NOT EXISTS FOR (n:Course) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT topic_id IF NOT EXISTS FOR (n:Topic) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT class_slot_id IF NOT EXISTS FOR (n:ClassSlot) REQUIRE n.id IS UNIQUE;

// CREATE: a disposable example node.
CREATE (:Topic {id: 'crud-demo-topic', name: 'CRUD Demo'});

// READ: inspect the disposable node.
MATCH (t:Topic {id: 'crud-demo-topic'}) RETURN t.id, t.name;

// UPDATE: change its display name.
MATCH (t:Topic {id: 'crud-demo-topic'}) SET t.name = 'CRUD Demo Updated' RETURN t;

// DELETE: remove the disposable example node.
MATCH (t:Topic {id: 'crud-demo-topic'}) DELETE t;

// Relationship traversal: a student's course, slot, needs, and current study connections.
MATCH (s:Student {id: 'demo-student-001'})-[:ENROLLED_IN]->(c:Course),
      (s)-[:BELONGS_TO]->(slot:ClassSlot),
      (s)-[:NEEDS_HELP_WITH]->(topic:Topic)
OPTIONAL MATCH (s)-[:STUDIES_WITH]-(peer:Student)
RETURN s.alias, c.code, slot.name, collect(DISTINCT topic.name) AS needs,
       collect(DISTINCT peer.alias) AS currentStudyPartners;

// Recommendation: shared course/slot plus complementary NEEDS_HELP_WITH and CAN_HELP_WITH skills.
MATCH (requester:Student {id: 'demo-student-001'})-[:ENROLLED_IN]->(course:Course),
      (requester)-[:BELONGS_TO]->(slot:ClassSlot),
      (requester)-[:NEEDS_HELP_WITH]->(topic:Topic)<-[:CAN_HELP_WITH]-(candidate:Student),
      (candidate)-[:ENROLLED_IN]->(course),
      (candidate)-[:BELONGS_TO]->(slot)
WHERE candidate.id <> requester.id AND candidate.synthetic = true
WITH candidate, course, collect(DISTINCT topic.name) AS topics
RETURN candidate.alias AS partner, course.code AS course, topics,
       size(topics) AS complementaryTopicCount
ORDER BY complementaryTopicCount DESC, partner;
