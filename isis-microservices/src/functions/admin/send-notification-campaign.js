import { handleAdmin } from "../../shared/admin-handler.js";
import { getAppointmentsAdminSettings } from "../../shared/admin-settings-service.js";
import { sendFirebasePush } from "../../shared/firebase-push-service.js";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { jsonResponse } from "../../shared/response.js";
import { parseJsonBody } from "../../shared/validator.js";

export const handler = handleAdmin(async (event) => {
  const body = parseJsonBody(event);
  const title = String(body.title || "").trim();
  const message = String(body.message || "").trim();

  if (!title || !message) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Los campos title y message son obligatorios para enviar la campana.",
      400
    );
  }

  const settings = await getAppointmentsAdminSettings();
  const result = await sendFirebasePush({
    title,
    body: message,
    type: body.type || "general",
    topic: body.topic || settings.notificationsTopic,
    data: body.data || {}
  });

  return jsonResponse(
    {
      message: result.skipped
        ? "La campana no se envio porque falta configurar Firebase en el backend."
        : "Campana enviada correctamente.",
      result
    },
    200
  );
});
