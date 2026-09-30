import { handle } from "../../shared/handler.js";
import { getAuthenticatedUser } from "../../shared/auth-context.js";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import {
  buildUserBenefits,
  getGlobalBenefit,
  listUserBenefitStates
} from "../../shared/benefits-service.js";
import { successResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const { userId } = getAuthenticatedUser(event);
  const benefitId = event.pathParameters?.benefitId;
  if (!benefitId) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, "benefitId es requerido.", 400);
  }

  const metadata = getGlobalBenefit(benefitId);
  if (!metadata) {
    throw new AppError(ERROR_CODES.BENEFIT_NOT_FOUND, "Beneficio no encontrado.", 404);
  }

  const [benefit] = buildUserBenefits([metadata], await listUserBenefitStates(userId));
  if (!benefit.active) {
    throw new AppError(
      ERROR_CODES.BENEFIT_NOT_ASSIGNED_TO_USER,
      "El beneficio ya fue utilizado y no está disponible.",
      403
    );
  }

  const {
    active,
    userStatus,
    inactiveAt,
    inactiveBy,
    reactivatedAt,
    updatedAt,
    ...response
  } = benefit;
  return successResponse({ ...response, assignedAt: null, viewed: false });
});
