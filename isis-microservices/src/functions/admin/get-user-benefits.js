import { handleAdmin } from "../../shared/admin-handler.js";
import { getUserBenefitsByCedula } from "../../shared/benefits-service.js";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handleAdmin(async (event) => {
  const cedula = String(event?.queryStringParameters?.cedula || "").trim();
  if (!cedula) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, "La cédula es obligatoria.", 400);
  }

  return jsonResponse(await getUserBenefitsByCedula(cedula));
});
