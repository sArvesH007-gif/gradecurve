import { defineConfig } from "prisma/config";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: databaseUrl ?? "",
  },
});
