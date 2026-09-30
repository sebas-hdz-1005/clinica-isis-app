import { handle } from "../../shared/handler.js";
import { bookAppointment } from "../../shared/appointments-service.js";
import { parseJsonBody } from "../../shared/validator.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const result = await bookAppointment(parseJsonBody(event));
  return jsonResponse(
    {
      message: result.message,
      appointment: result.appointment,
      notificationEmailStatus: result.notificationEmailStatus
    },
    201
  );
});
