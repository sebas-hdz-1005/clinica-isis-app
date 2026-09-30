import { handleAdmin } from "../../shared/admin-handler.js";
import { reviewPrebookedAppointment } from "../../shared/appointments-service.js";
import { parseJsonBody } from "../../shared/validator.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handleAdmin(async (event, _context, admin) => {
  const body = parseJsonBody(event);
  const result = await reviewPrebookedAppointment({
    appointmentId: event?.pathParameters?.appointmentId,
    decision: body.decision,
    reviewedBy: admin.username || admin.email || body.reviewedBy,
    notes: body.notes
  });

  return jsonResponse(result, 200);
});
