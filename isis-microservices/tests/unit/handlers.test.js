import test from "node:test";
import assert from "node:assert/strict";
import { handler as getBlogDetailHandler } from "../../src/functions/blogs/get-blog-detail.js";

test("get-blog-detail handler validates slug before provider call", async () => {
  const response = await getBlogDetailHandler({}, { awsRequestId: "test" });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, "VALIDATION_ERROR");
});
