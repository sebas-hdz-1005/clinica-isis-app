import { handleAdmin } from "../../shared/admin-handler.js";
import { previewAgendaSchedule } from "../../shared/agenda-schedule-import.js";
import { parseJsonBody } from "../../shared/validator.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handleAdmin(async (event) => {
  const body = parseJsonBody(event);
  const preview = await previewAgendaSchedule({ fileBase64: body.fileBase64, month: body.month });
  return jsonResponse(preview, 200);
});
