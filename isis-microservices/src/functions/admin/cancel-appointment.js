import { handleAdmin } from "../../shared/admin-handler.js";
import { cancelAppointmentByAdmin } from "../../shared/appointments-service.js";
import { parseJsonBody } from "../../shared/validator.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handleAdmin(async (event, _context, admin) => {
  const body = parseJsonBody(event);
  const result = await cancelAppointmentByAdmin({
    appointmentId: event?.pathParameters?.appointmentId,
    cancelledBy: admin.username || admin.email || body.cancelledBy || "dashboard",
    reason: body.reason
  });

  return jsonResponse(result, 200);
});
