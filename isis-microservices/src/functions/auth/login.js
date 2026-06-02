import { handle } from "../../shared/handler.js";
import { loginWithCognito } from "../../shared/cognito.js";
import { parseJsonBody, validateBody } from "../../shared/validator.js";
import { successResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const body = validateBody(parseJsonBody(event), {
    cedula: { required: true, type: "string" },
    password: { required: true, type: "string" }
  });
  const data = await loginWithCognito(body);
  return successResponse(data);
});
