import { defineConfig, devices } from "@playwright/test";
import path from "path";

export const TEST_DB_PATH = path.resolve(process.cwd(), "test.db");
export const ADMIN_AUTH_FILE = "tests/e2e/.auth/admin.json";
export const USER_AUTH_FILE = "tests/e2e/.auth/user.json";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // share one DB, keep tests sequential
  // fullyParallel:false only serialises tests *within* a file — separate files
  // still get their own worker. One shared DB plus specs that mutate user
  // settings means the whole run has to be single-threaded.
  workers: 1,
  retries: 0,
  reporter: "list",

  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },

  projects: [
    // Runs first: signs up seed users and saves storageState
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // Main test suite — depends on setup having completed
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",

  webServer: {
    command: "pnpm db:migrate && pnpm exec next dev --port 3001",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: "file:./test.db",
      SKIP_ENV_VALIDATION: "true",
      BETTER_AUTH_SECRET: "test-secret-for-e2e-do-not-use-in-production",
    },
  },
});
