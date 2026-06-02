import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonBody, parsePagination, validateBody } from "../../src/shared/validator.js";

test("parseJsonBody parses body", () => {
  assert.deepEqual(parseJsonBody({ body: "{\"a\":1}" }), { a: 1 });
});

test("validateBody rejects missing required fields", () => {
  assert.throws(
    () => validateBody({}, { cedula: { required: true, type: "string" } }),
    /La petición no cumple/
  );
});

test("parsePagination applies defaults", () => {
  assert.deepEqual(parsePagination({}), { limit: 10, skip: 0 });
});
