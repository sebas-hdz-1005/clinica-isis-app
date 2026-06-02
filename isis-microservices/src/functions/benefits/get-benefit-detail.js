import { handle } from "../../shared/handler.js";
import { getAuthenticatedUser } from "../../shared/auth-context.js";
import { getItem } from "../../shared/dynamodb.js";
import { ENV } from "../../shared/constants.js";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { mapBenefitDetail } from "../../shared/benefit-mapper.js";
import { successResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const { userId } = getAuthenticatedUser(event);
  const benefitId = event.pathParameters?.benefitId;
  if (!benefitId) throw new AppError(ERROR_CODES.VALIDATION_ERROR, "benefitId es requerido.", 400);

  const assignment = await getItem(ENV.BENEFITS_TABLE, {
    PK: `USER#${userId}`,
    SK: `BENEFIT#${benefitId}`
  });
  if (!assignment) {
    throw new AppError(ERROR_CODES.BENEFIT_NOT_ASSIGNED_TO_USER, "El beneficio no está asignado al usuario.", 403);
  }

  const metadata = await getItem(ENV.BENEFITS_TABLE, {
    PK: `BENEFIT#${benefitId}`,
    SK: "METADATA"
  });
  if (!metadata) throw new AppError(ERROR_CODES.BENEFIT_NOT_FOUND, "Beneficio no encontrado.", 404);

  return successResponse(mapBenefitDetail(assignment, metadata));
});
