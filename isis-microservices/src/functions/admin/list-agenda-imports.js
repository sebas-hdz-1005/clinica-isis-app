import { handleAdmin } from "../../shared/admin-handler.js";
import { listAgendaImportsData } from "../../shared/appointments-service.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handleAdmin(async (event) =>
  jsonResponse(await listAgendaImportsData(event?.queryStringParameters || {}))
);
