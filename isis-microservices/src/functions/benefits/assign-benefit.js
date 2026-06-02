import { handle } from "../../shared/handler.js";
import { requireAdmin } from "../../shared/auth-context.js";
import { getItem, putItem } from "../../shared/dynamodb.js";
import { ENV } from "../../shared/constants.js";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { parseJsonBody, validateBody } from "../../shared/validator.js";
import { messageResponse } from "../../shared/response.js";
import { sendBenefitAlert } from "../../shared/notifications-service.js";

export const handler = handle(async (event) => {
  requireAdmin(event);
  const body = validateBody(parseJsonBody(event), {
    userId: { required: true, type: "string" },
    benefitId: { required: true, type: "string" }
  });

  const user = await getItem(ENV.USERS_TABLE, { PK: `USER#${body.userId}`, SK: "PROFILE" });
  if (!user) throw new AppError(ERROR_CODES.USER_NOT_FOUND, "Usuario no encontrado.", 404);

  const metadata = await getItem(ENV.BENEFITS_TABLE, {
    PK: `BENEFIT#${body.benefitId}`,
    SK: "METADATA"
  });
  if (!metadata) throw new AppError(ERROR_CODES.BENEFIT_NOT_FOUND, "Beneficio no encontrado.", 404);

  const now = new Date().toISOString();
  try {
    await putItem(ENV.BENEFITS_TABLE, {
      PK: `USER#${body.userId}`,
      SK: `BENEFIT#${body.benefitId}`,
      benefitId: body.benefitId,
      assignedAt: now,
      viewed: false,
      notified: false
    }, {
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    });
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      throw new AppError(ERROR_CODES.BENEFIT_ALREADY_ASSIGNED, "El beneficio ya está asignado al usuario.", 409);
    }
    throw error;
  }

  await sendBenefitAlert({ userId: body.userId, benefitId: body.benefitId });

  return messageResponse("Beneficio asignado correctamente.", 201, {
    userId: body.userId,
    benefitId: body.benefitId
  });
});
