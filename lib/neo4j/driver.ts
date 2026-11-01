import "server-only";
import neo4j, { type Driver } from "neo4j-driver";

const globalForNeo4j = globalThis as typeof globalThis & {
  neo4jDriver?: Driver;
};

export function getNeo4jDriver() {
  if (globalForNeo4j.neo4jDriver) return globalForNeo4j.neo4jDriver;

  const { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } = process.env;
  if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
    throw new Error(
      "Neo4j is not configured. Set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD.",
    );
  }

  globalForNeo4j.neo4jDriver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
  );
  return globalForNeo4j.neo4jDriver;
}

export function getNeo4jDatabase() {
  return process.env.NEO4J_DATABASE || "neo4j";
}
