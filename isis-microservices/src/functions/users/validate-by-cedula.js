import { handle } from "../../shared/handler.js";
import { successResponse } from "../../shared/response.js";
import { findUserProfileByCedula } from "../../shared/users-service.js";
import { STATUS } from "../../shared/constants.js";
import { AppError, ERROR_CODES } from "../../shared/errors.js";

export const handler = handle(async (event) => {
  const cedula = String(event?.queryStringParameters?.cedula || "").trim();

  if (!cedula) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, "La cedula es obligatoria.", 400);
  }

  const profile = await findUserProfileByCedula(cedula);

  if (!profile) {
    return successResponse({
      exists: false,
      cedula
    });
  }

  return successResponse({
    exists: true,
    cedula,
    userId: String(profile.PK || "").replace(/^USER#/, ""),
    documentType: profile.documentType || null,
    name: profile.name || null,
    email: profile.email || null,
    phone: profile.phone || null,
    status: profile.status || STATUS.INACTIVE,
    isActive: profile.status === STATUS.ACTIVE
  });
});
