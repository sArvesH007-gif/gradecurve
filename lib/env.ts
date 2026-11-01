import { z } from "zod";

const environmentSchema = z.object({
  ORACLE_USER: z.string().min(1),
  ORACLE_PASSWORD: z.string().min(1),
  ORACLE_CONNECT_STRING: z.string().min(1),
  NEO4J_URI: z.string().startsWith("bolt://"),
  NEO4J_USERNAME: z.string().min(1),
  NEO4J_PASSWORD: z.string().min(1),
  NEO4J_DATABASE: z.string().default("neo4j"),
  // Optional legacy values are used only by the preserved Prisma tooling.
  DATABASE_URL: z.url().startsWith("postgres").optional(),
  DIRECT_URL: z.url().startsWith("postgres").optional(),
  AUTH_SECRET: z
    .string()
    .min(32)
    .refine((value) => !value.startsWith("replace-with-"), {
      message:
        "Replace the example value with a random secret before starting the app.",
    }),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export function getEnvironment() {
  return environmentSchema.parse(process.env);
}
