import { handleAdmin } from "../../shared/admin-handler.js";
import { importAgendaData } from "../../shared/appointments-service.js";
import { parseJsonBody } from "../../shared/validator.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handleAdmin(async (event) => {
  const result = await importAgendaData(parseJsonBody(event));
  return jsonResponse({ message: result.message, import: result.import }, 201);
});
