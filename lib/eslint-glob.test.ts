import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

test("Next ESLint root globs work with the maintained glob replacement", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tech-store-eslint-"));
  try {
    for (const name of ["one", "two"]) mkdirSync(path.join(root, "packages", name), { recursive: true });
    writeFileSync(path.join(root, "packages", "file.txt"), "fixture");
    const require = createRequire(path.join(process.cwd(), "package.json"));
    const { getRootDirs } = require(path.join(path.dirname(require.resolve("@next/eslint-plugin-next")), "utils", "get-root-dirs.js"));
    const dirs: string[] = getRootDirs({ cwd: root, settings: { next: { rootDir: path.join(root, "packages", "*") } } });
    assert.deepEqual(dirs.map(dir => path.basename(dir)).sort(), ["one", "two"]);
  } finally {
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep) || !path.basename(root).startsWith("tech-store-eslint-")) throw new Error("Unexpected cleanup path");
    rmSync(root, { recursive: true, force: true });
  }
});
