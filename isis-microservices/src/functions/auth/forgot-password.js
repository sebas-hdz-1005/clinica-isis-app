import { handle } from "../../shared/handler.js";
import { startForgotPassword } from "../../shared/cognito.js";
import { parseJsonBody, validateBody } from "../../shared/validator.js";
import { messageResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const body = validateBody(parseJsonBody(event), {
    cedula: { required: true, type: "string" }
  });
  await startForgotPassword(body);
  return messageResponse("Se envió un código de recuperación al medio registrado.");
});
