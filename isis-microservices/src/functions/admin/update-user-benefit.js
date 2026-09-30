import { handleAdmin } from "../../shared/admin-handler.js";
import { setUserBenefitActive } from "../../shared/benefits-service.js";
import { parseJsonBody, validateBody } from "../../shared/validator.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handleAdmin(async (event, context, admin) => {
  const body = validateBody(parseJsonBody(event), {
    active: { required: true, type: "boolean" }
  });
  const benefit = await setUserBenefitActive({
    userId: event?.pathParameters?.userId,
    benefitId: event?.pathParameters?.benefitId,
    active: body.active,
    updatedBy: admin.username || admin.email || admin.userId
  });

  return jsonResponse({
    message: body.active
      ? "Beneficio reactivado correctamente."
      : "Beneficio marcado como utilizado e inactivado.",
    benefit
  });
});
