import { existsSync, unlinkSync } from "fs";
import { TEST_DB_PATH } from "../../playwright.config";

export default async function globalTeardown() {
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
}
