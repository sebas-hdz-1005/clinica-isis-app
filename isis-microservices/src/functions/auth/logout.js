import { handle } from "../../shared/handler.js";
import { logoutFromCognito } from "../../shared/cognito.js";
import { parseJsonBody, validateBody } from "../../shared/validator.js";
import { messageResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const body = validateBody(parseJsonBody(event), {
    accessToken: { required: true, type: "string" }
  });
  await logoutFromCognito(body);
  return messageResponse("Sesión cerrada correctamente.");
});
