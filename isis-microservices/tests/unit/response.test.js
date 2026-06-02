import test from "node:test";
import assert from "node:assert/strict";
import { errorResponse, messageResponse, successResponse } from "../../src/shared/response.js";

test("successResponse returns standardized JSON", () => {
  const response = successResponse({ ok: true });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { success: true, data: { ok: true } });
});

test("messageResponse can include optional data", () => {
  const response = messageResponse("created", 201, { id: "1" });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(JSON.parse(response.body), { success: true, message: "created", data: { id: "1" } });
});

test("errorResponse returns standardized error", () => {
  const response = errorResponse("VALIDATION_ERROR", "Invalid", 400, ["field"]);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid",
      details: ["field"]
    }
  });
});
