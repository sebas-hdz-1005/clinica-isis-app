import { handle } from "../../shared/handler.js";
import { jsonResponse } from "../../shared/response.js";
import { listSoftwareMedicoSpecialists } from "../../shared/software-medico-service.js";
import { getAppointmentsAdminSettings } from "../../shared/admin-settings-service.js";
import {
  getSoftwareMedicoDoctorActiveRange,
  getSoftwareMedicoActiveWeekdays,
  isSoftwareMedicoDoctorAvailableBetween,
  isSoftwareMedicoDoctorActive,
  isSoftwareMedicoSpecialtyActive
} from "../../shared/software-medico-config.js";
import { AppError, ERROR_CODES } from "../../shared/errors.js";

export const handler = handle(async (event) => {
  const especialidadId =
    event?.pathParameters?.especialidadId ??
    event?.queryStringParameters?.especialidadId;
  const [{ specialty, specialists }, settings] = await Promise.all([
    listSoftwareMedicoSpecialists(especialidadId),
    getAppointmentsAdminSettings()
  ]);
  if (
    !isSoftwareMedicoSpecialtyActive(
      settings.softwareMedicoConfig,
      specialty.id
    )
  ) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      "La especialidad no esta habilitada para agendamiento.",
      404
    );
  }

  return jsonResponse({
    especialidad_id: specialty.id,
    dias_semana_activos: getSoftwareMedicoActiveWeekdays(
      settings.softwareMedicoConfig,
      specialty.id
    ),
    medicos: specialists
      .filter(
        (doctor) =>
          isSoftwareMedicoDoctorActive(
            settings.softwareMedicoConfig,
            specialty.id,
            doctor.id
          ) &&
          isSoftwareMedicoDoctorAvailableBetween(
            settings.softwareMedicoConfig,
            specialty.id,
            doctor.id,
            event?.queryStringParameters?.date ||
              new Date().toISOString().slice(0, 10)
          )
      )
      .map((doctor) => ({
        ...doctor,
        rango_activo: getSoftwareMedicoDoctorActiveRange(
          settings.softwareMedicoConfig,
          specialty.id,
          doctor.id
        )
      }))
  });
});
