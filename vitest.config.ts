import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    env: {
      // Skip Next.js env validation — tests inject their own DB and never touch
      // the module-level singletons created at import time.
      SKIP_ENV_VALIDATION: "true",
      // Provide a valid DATABASE_URL so the module-level LibSQL client
      // initialises without throwing. It is never actually queried in unit
      // tests because each test injects its own in-memory DB via context.ts.
      DATABASE_URL: "file:///tmp/vale-bank-test-dummy.db",
      NODE_ENV: "test",
    },
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      exclude: [
        "*.config.*",
        "src/env.js",
        ".next/**",
        "node_modules/**",
        "drizzle/**",
        "scripts/**",
      ],
    },
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
});
