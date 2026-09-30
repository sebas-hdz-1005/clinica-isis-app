import { handle } from "../../shared/handler.js";
import { cancelAppointment } from "../../shared/appointments-service.js";
import { parseJsonBody } from "../../shared/validator.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const result = await cancelAppointment(parseJsonBody(event));
  return jsonResponse({ message: result.message, appointmentId: result.appointmentId });
});
