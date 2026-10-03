import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.url().startsWith("postgres"),
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
