import { handle } from "../../shared/handler.js";
import { jsonResponse } from "../../shared/response.js";
import { getAgendaDisponibleData } from "../../shared/agenda-disponible-service.js";

export const handler = handle(async (event) =>
  jsonResponse(await getAgendaDisponibleData(event?.queryStringParameters || {}))
);
