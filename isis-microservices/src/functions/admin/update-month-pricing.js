import { handleAdmin } from "../../shared/admin-handler.js";
import { updateAgendaMonthPricing } from "../../shared/appointments-service.js";
import { parseJsonBody } from "../../shared/validator.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handleAdmin(async (event) => {
  const body = parseJsonBody(event);
  return jsonResponse(
    {
      message: "Precios del mes actualizados correctamente.",
      result: await updateAgendaMonthPricing(body)
    },
    200
  );
});
