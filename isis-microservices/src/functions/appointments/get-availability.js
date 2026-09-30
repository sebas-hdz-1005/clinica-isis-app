import { handle } from "../../shared/handler.js";
import { listAvailableSlots } from "../../shared/appointments-service.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handle(async (event) =>
  jsonResponse(await listAvailableSlots(event?.queryStringParameters || {}))
);
