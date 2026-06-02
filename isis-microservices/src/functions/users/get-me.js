import { handle } from "../../shared/handler.js";
import { getAuthenticatedUser } from "../../shared/auth-context.js";
import { getItem } from "../../shared/dynamodb.js";
import { ENV, STATUS } from "../../shared/constants.js";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { successResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const { userId } = getAuthenticatedUser(event);
  const profile = await getItem(ENV.USERS_TABLE, { PK: `USER#${userId}`, SK: "PROFILE" });
  if (!profile) throw new AppError(ERROR_CODES.PROFILE_NOT_FOUND, "Perfil de usuario no encontrado.", 404);
  if (profile.status !== STATUS.ACTIVE) throw new AppError(ERROR_CODES.USER_INACTIVE, "El usuario está inactivo.", 403);
  return successResponse({
    userId,
    cedula: profile.cedula,
    documentType: profile.documentType,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    status: profile.status
  });
});
