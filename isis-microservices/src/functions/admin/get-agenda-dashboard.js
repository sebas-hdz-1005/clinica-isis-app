import { handleAdmin } from "../../shared/admin-handler.js";
import { getAgendaDashboardData } from "../../shared/appointments-service.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handleAdmin(async (event) =>
  jsonResponse(
    await getAgendaDashboardData({
      month: event?.queryStringParameters?.month
    })
  )
);
