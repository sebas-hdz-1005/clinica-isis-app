import { handle } from "../../shared/handler.js";
import { createPreappointment } from "../../shared/appointments-service.js";
import { jsonResponse } from "../../shared/response.js";
import { parseJsonBody } from "../../shared/validator.js";

export const handler = handle(async (event) => {
  const result = await createPreappointment(parseJsonBody(event));
  return jsonResponse(
    {
      message: result.message,
      ...result.preappointment
    },
    201
  );
});
