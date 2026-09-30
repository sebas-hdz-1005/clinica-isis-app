import { handleAdmin } from "../../shared/admin-handler.js";
import { getAppointmentsAdminSettings } from "../../shared/admin-settings-service.js";
import { jsonResponse } from "../../shared/response.js";

export const handler = handleAdmin(async () => jsonResponse(await getAppointmentsAdminSettings()));
