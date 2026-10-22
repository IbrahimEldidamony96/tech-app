import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNextPath } from "./safe-next-path";
import { GET } from "../app/api/locale/route";
import { NextRequest } from "next/server";

test("local redirects reject URL normalization and encoded authority bypasses", async () => {
  for (const input of ["//outside.example", "/\t/outside.example", "/\n/outside.example", "/\r/outside.example", "/\\outside.example", "/%09/outside.example", "/%0a/outside.example", "/%0d/outside.example", "/%5coutside.example", "/%2foutside.example", "/%2509/outside.example", "https://outside.example"]) {
    assert.equal(safeNextPath(input), "/", JSON.stringify(input));
    const response = await GET(new NextRequest(`https://store.example/api/locale?locale=ar&redirect=${encodeURIComponent(input)}`));
    assert.equal(response.headers.get("location"), "https://store.example/", JSON.stringify(input));
  }
  for (const input of ["/", "/account/orders?sort=new#latest", "/products/%D9%87%D8%A7%D8%AA%D9%81", "/search?q=hello%20world", "/search?q=100%25"]) {
    assert.equal(safeNextPath(input), input);
  }
  assert.equal(safeNextPath(null, "//outside.example"), "/");
});
