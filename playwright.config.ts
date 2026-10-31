import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });
config();
const authSecret =
  process.env.AUTH_SECRET ?? randomBytes(32).toString("base64url");
process.env.AUTH_SECRET = authSecret;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm.cmd run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...(process.env.DATABASE_URL
        ? { DATABASE_URL: process.env.DATABASE_URL }
        : {}),
      ...(process.env.ORACLE_USER ? { ORACLE_USER: process.env.ORACLE_USER } : {}),
      ...(process.env.ORACLE_PASSWORD
        ? { ORACLE_PASSWORD: process.env.ORACLE_PASSWORD }
        : {}),
      ...(process.env.ORACLE_CONNECT_STRING
        ? { ORACLE_CONNECT_STRING: process.env.ORACLE_CONNECT_STRING }
        : {}),
      AUTH_SECRET: authSecret,
    },
  },
});
