import { mkdir } from "fs/promises";

export default async function globalSetup() {
  // DB is deleted by the pretest:e2e script and migrated by the webServer command.
  // globalSetup only needs to ensure the storageState directory exists.
  await mkdir("tests/e2e/.auth", { recursive: true });
}
