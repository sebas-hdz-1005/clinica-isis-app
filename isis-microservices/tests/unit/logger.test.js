import test from "node:test";
import assert from "node:assert/strict";
import { maskCedula, sanitize } from "../../src/shared/logger.js";

test("maskCedula hides all but last four digits", () => {
  assert.equal(maskCedula("1023899033"), "******9033");
});

test("sanitize redacts sensitive fields", () => {
  const result = sanitize({
    cedula: "1023899033",
    password: "secret",
    nested: {
      accessToken: "token",
      deviceToken: "device"
    }
  });
  assert.equal(result.cedula, "******9033");
  assert.equal(result.password, "[REDACTED]");
  assert.equal(result.nested.accessToken, "[REDACTED]");
  assert.equal(result.nested.deviceToken, "[REDACTED]");
});
