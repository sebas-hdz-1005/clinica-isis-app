import { handle } from "../../shared/handler.js";
import { confirmForgotPassword } from "../../shared/cognito.js";
import { parseJsonBody, validateBody } from "../../shared/validator.js";
import { messageResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const body = validateBody(parseJsonBody(event), {
    cedula: { required: true, type: "string" },
    code: { required: true, type: "string" },
    newPassword: { required: true, type: "string" }
  });
  await confirmForgotPassword(body);
  return messageResponse("Contraseña actualizada correctamente.");
});
