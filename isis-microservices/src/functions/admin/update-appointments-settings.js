import { handleAdmin } from "../../shared/admin-handler.js";
import { updateAppointmentsAdminSettings } from "../../shared/admin-settings-service.js";
import { parseJsonBody } from "../../shared/validator.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handleAdmin(async (event) =>
  jsonResponse(
    {
      message: "Configuracion actualizada correctamente.",
      settings: await updateAppointmentsAdminSettings(parseJsonBody(event))
    },
    200
  )
);
