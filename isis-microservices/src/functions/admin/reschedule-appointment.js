import { handleAdmin } from "../../shared/admin-handler.js";
import { rescheduleAppointmentByAdmin } from "../../shared/appointments-service.js";
import { parseJsonBody } from "../../shared/validator.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handleAdmin(async (event, _context, admin) => {
  const body = parseJsonBody(event);
  const result = await rescheduleAppointmentByAdmin({
    appointmentId: event?.pathParameters?.appointmentId,
    slotId: body.slotId,
    updatedBy: admin.username || admin.email || body.updatedBy || "dashboard",
    notes: body.notes
  });

  return jsonResponse(result, 200);
});
