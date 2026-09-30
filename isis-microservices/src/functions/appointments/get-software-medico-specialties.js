import { handle } from "../../shared/handler.js";
import { jsonResponse } from "../../shared/response.js";
import { listSoftwareMedicoSpecialties } from "../../shared/software-medico-service.js";
import { getAppointmentsAdminSettings } from "../../shared/admin-settings-service.js";
import { filterActiveSoftwareMedicoCatalog } from "../../shared/software-medico-config.js";

export const handler = handle(async (event) => {
  const [providerSpecialties, settings] = await Promise.all([
    listSoftwareMedicoSpecialties(),
    getAppointmentsAdminSettings()
  ]);
  const specialties = filterActiveSoftwareMedicoCatalog(
    providerSpecialties,
    settings.softwareMedicoConfig,
    {
      startDate:
        event?.queryStringParameters?.date ||
        new Date().toISOString().slice(0, 10)
    }
  );
  return jsonResponse({
    especialidades: specialties.map(({ id, nombre, codigo, especialistas, dias_semana_activos }) => ({
      id,
      nombre,
      ...(codigo ? { codigo } : {}),
      dias_semana_activos,
      medicos: especialistas
    }))
  });
});
