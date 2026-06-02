import { handle } from "../../shared/handler.js";
import { parseJsonBody, validateBody } from "../../shared/validator.js";
import { sendBenefitAlert } from "../../shared/notifications-service.js";
import { successResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const body = validateBody(parseJsonBody(event), {
    userId: { required: true, type: "string" },
    benefitId: { required: true, type: "string" }
  });
  const result = await sendBenefitAlert(body);
  return successResponse(result);
});
