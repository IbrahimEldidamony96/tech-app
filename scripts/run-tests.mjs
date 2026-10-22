import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const collect = path => readdirSync(path, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? collect(`${path}/${entry.name}`) : /\.test\.(ts|mjs)$/.test(entry.name) ? [`${path}/${entry.name}`] : []);
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...["lib", "prisma"].flatMap(collect)], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
