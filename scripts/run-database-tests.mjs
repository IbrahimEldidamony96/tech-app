import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
dotenv.config({ path: ".env.audit", quiet: true });
const target = process.env.TEST_DATABASE_URL;
if (!target) throw new Error("Set TEST_DATABASE_URL to an isolated PostgreSQL test database. The application database is never used as a fallback.");
const endpoint = value => new URL(value).hostname.replace("-pooler.", ".");
if (existsSync(".env")) {
  const primary = dotenv.parse(readFileSync(".env")).DATABASE_URL;
  if (primary && endpoint(primary) === endpoint(target)) throw new Error("Database tests must run on a separate endpoint from the application's configured database.");
}
const env = { ...process.env, NODE_ENV: "test", DATABASE_URL: target, DATABASE_URL_UNPOOLED: target };
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...process.argv.slice(2), "tests/database.integration.ts"], { stdio: "inherit", env });
process.exitCode = result.status ?? 1;
