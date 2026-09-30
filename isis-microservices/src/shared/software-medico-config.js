const normalizeId = (value) => {
  const id = String(value ?? "").trim();
  return /^\d+$/.test(id) ? id : null;
};

const normalizeIdList = (value) => {
  if (!Array.isArray(value)) return null;
  return Array.from(new Set(value.map(normalizeId).filter(Boolean)));
};

export const SOFTWARE_MEDICO_WEEKDAYS = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo"
];

const normalizeWord = (value) =>
  String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const normalizeWeekdayList = (value) => {
  if (!Array.isArray(value)) return null;
  return Array.from(
    new Set(
      value
        .map(normalizeWord)
        .filter((day) => SOFTWARE_MEDICO_WEEKDAYS.includes(day))
    )
  );
};

const normalizeOptionalDate = (value) => {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
};

export const normalizeSoftwareMedicoConfig = (value = {}) => {
  const medicosActivosPorEspecialidad = {};
  const diasActivosPorEspecialidad = {};
  const rangosActivosPorMedico = {};

  Object.entries(value?.medicosActivosPorEspecialidad || {}).forEach(
    ([specialtyIdValue, doctorIds]) => {
      const specialtyId = normalizeId(specialtyIdValue);
      const normalizedDoctors = normalizeIdList(doctorIds);
      if (specialtyId && normalizedDoctors) {
        medicosActivosPorEspecialidad[specialtyId] = normalizedDoctors;
      }
    }
  );

  Object.entries(value?.diasActivosPorEspecialidad || {}).forEach(
    ([specialtyIdValue, weekdays]) => {
      const specialtyId = normalizeId(specialtyIdValue);
      const normalizedWeekdays = normalizeWeekdayList(weekdays);
      if (specialtyId && normalizedWeekdays) {
        diasActivosPorEspecialidad[specialtyId] = normalizedWeekdays;
      }
    }
  );

  Object.entries(value?.rangosActivosPorMedico || {}).forEach(
    ([specialtyIdValue, doctorRanges]) => {
      const specialtyId = normalizeId(specialtyIdValue);
      if (!specialtyId || !doctorRanges || typeof doctorRanges !== "object") {
        return;
      }

      const normalizedRanges = {};
      Object.entries(doctorRanges).forEach(([doctorIdValue, range]) => {
        const doctorId = normalizeId(doctorIdValue);
        if (!doctorId || !range || typeof range !== "object") return;

        const fechaInicio = normalizeOptionalDate(range.fechaInicio);
        const fechaFin = normalizeOptionalDate(range.fechaFin);
        if (fechaInicio || fechaFin) {
          normalizedRanges[doctorId] = {
            ...(fechaInicio ? { fechaInicio } : {}),
            ...(fechaFin ? { fechaFin } : {})
          };
        }
      });

      if (Object.keys(normalizedRanges).length) {
        rangosActivosPorMedico[specialtyId] = normalizedRanges;
      }
    }
  );

  return {
    especialidadesActivas: normalizeIdList(value?.especialidadesActivas),
    medicosActivosPorEspecialidad,
    diasActivosPorEspecialidad,
    rangosActivosPorMedico
  };
};

export const isSoftwareMedicoSpecialtyActive = (config, specialtyId) => {
  const normalized = normalizeSoftwareMedicoConfig(config);
  return (
    normalized.especialidadesActivas === null ||
    normalized.especialidadesActivas.includes(String(specialtyId))
  );
};

export const isSoftwareMedicoDoctorActive = (config, specialtyId, doctorId) => {
  const normalized = normalizeSoftwareMedicoConfig(config);
  const configuredDoctors =
    normalized.medicosActivosPorEspecialidad[String(specialtyId)];
  return (
    configuredDoctors === undefined ||
    configuredDoctors.includes(String(doctorId))
  );
};

export const getSoftwareMedicoActiveWeekdays = (config, specialtyId) => {
  const normalized = normalizeSoftwareMedicoConfig(config);
  return (
    normalized.diasActivosPorEspecialidad[String(specialtyId)] ??
    [...SOFTWARE_MEDICO_WEEKDAYS]
  );
};

export const isSoftwareMedicoWeekdayActive = (
  config,
  specialtyId,
  weekday
) =>
  getSoftwareMedicoActiveWeekdays(config, specialtyId).includes(
    normalizeWord(weekday)
  );

export const getSoftwareMedicoDoctorActiveRange = (
  config,
  specialtyId,
  doctorId
) => {
  const normalized = normalizeSoftwareMedicoConfig(config);
  return (
    normalized.rangosActivosPorMedico[String(specialtyId)]?.[
      String(doctorId)
    ] || {}
  );
};

export const isSoftwareMedicoDoctorAvailableBetween = (
  config,
  specialtyId,
  doctorId,
  startDate,
  endDate = startDate
) => {
  const range = getSoftwareMedicoDoctorActiveRange(
    config,
    specialtyId,
    doctorId
  );
  const start = normalizeOptionalDate(startDate);
  const end = normalizeOptionalDate(endDate) || start;

  if (!start || !end) return true;
  if (range.fechaInicio && end < range.fechaInicio) return false;
  if (range.fechaFin && start > range.fechaFin) return false;
  return true;
};

export const filterActiveSoftwareMedicoCatalog = (
  specialties,
  config,
  { startDate, endDate } = {}
) =>
  specialties
    .filter((specialty) =>
      isSoftwareMedicoSpecialtyActive(config, specialty.id)
    )
    .map((specialty) => ({
      ...specialty,
      dias_semana_activos: getSoftwareMedicoActiveWeekdays(
        config,
        specialty.id
      ),
      especialistas: specialty.especialistas
        .filter((doctor) =>
          isSoftwareMedicoDoctorActive(config, specialty.id, doctor.id) &&
          isSoftwareMedicoDoctorAvailableBetween(
            config,
            specialty.id,
            doctor.id,
            startDate,
            endDate
          )
        )
        .map((doctor) => ({
          ...doctor,
          rango_activo: getSoftwareMedicoDoctorActiveRange(
            config,
            specialty.id,
            doctor.id
          )
        }))
    }));
