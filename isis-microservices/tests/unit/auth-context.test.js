import test from "node:test";
import assert from "node:assert/strict";
import { getAuthenticatedUser, requireAdmin } from "../../src/shared/auth-context.js";

const event = {
  requestContext: {
    authorizer: {
      jwt: {
        claims: {
          sub: "sub-123",
          "cognito:username": "1023899033",
          "cognito:groups": "admin"
        }
      }
    }
  }
};

test("getAuthenticatedUser extracts sub from JWT claims", () => {
  assert.equal(getAuthenticatedUser(event).userId, "sub-123");
});

test("requireAdmin accepts admin group", () => {
  assert.equal(requireAdmin(event).groups.includes("admin"), true);
});

test("getAuthenticatedUser rejects missing sub", () => {
  assert.throws(() => getAuthenticatedUser({}), /No se pudo identificar/);
});
