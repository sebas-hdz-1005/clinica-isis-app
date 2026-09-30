import { ENV } from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { slugify } from "./appointments-parser.js";
import { getAppointmentsAdminSettings } from "./admin-settings-service.js";
import {
  getSoftwareMedicoAvailability,
  listSoftwareMedicoAppointmentTypes,
  listSoftwareMedicoSites,
  listSoftwareMedicoSpecialists
} from "./software-medico-service.js";
import {
  getSoftwareMedicoActiveWeekdays,
  isSoftwareMedicoDoctorAvailableBetween,
  isSoftwareMedicoDoctorActive,
  isSoftwareMedicoSpecialtyActive
} from "./software-medico-config.js";

const MAX_DATE_RANGE_DAYS = 31;
const ALL_WEEKDAYS = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo"
];

const compactText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizeWord = (value) =>
  compactText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const ensureId = (value, field) => {
  const normalized = compactText(value);
  if (!/^\d+$/.test(normalized)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      `El parametro ${field} es obligatorio y debe ser un identificador numerico.`,
      400
    );
  }
  return normalized;
};

const parseDate = (value, field) => {
  const normalized = compactText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      `El parametro ${field} es obligatorio y debe tener formato YYYY-MM-DD.`,
      400
    );
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      `El parametro ${field} contiene una fecha invalida.`,
      400
    );
  }
  return date;
};

const formatDate = (date) => date.toISOString().slice(0, 10);

const enumerateDates = (start, end) => {
  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
    if (dates.length > MAX_DATE_RANGE_DAYS) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `El rango consultado no puede superar ${MAX_DATE_RANGE_DAYS} dias.`,
        400
      );
    }
  }
  return dates;
};

const weekdayForDate = (date) => {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return ALL_WEEKDAYS[(day + 6) % 7];
};

const configuredWeekdays = (config = {}) => {
  if (!Array.isArray(config.dias_semana_activos)) return ALL_WEEKDAYS;
  return Array.from(
    new Set(config.dias_semana_activos.map(normalizeWord).filter((day) => ALL_WEEKDAYS.includes(day)))
  );
};

const isDateEnabled = (date, config = {}) => {
  if (config.fechaInicio && date < config.fechaInicio) return false;
  if (config.fechaFin && date > config.fechaFin) return false;
  return configuredWeekdays(config).includes(weekdayForDate(date));
};

const isUnavailableSlot = (item = {}) => {
  if (
    item.disponible === false ||
    item.habilitado === false ||
    item.activo === false ||
    item.available === false ||
    item.ocupado === true
  ) {
    return true;
  }
  const status = normalizeWord(item.estado ?? item.status);
  return ["ocupado", "reservado", "inactivo", "no disponible", "cancelado"].includes(status);
};

const parseTime = (value) => {
  const text = compactText(value);
  const match = text.match(/(?:^|[T\s])(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i) ||
    text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = normalizeWord(match[3]).replace(/\s|\./g, "");
  if (minutes > 59 || hours > (period ? 12 : 23)) return null;
  if (period === "pm" && hours < 12) hours += 12;
  if (period === "am" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const collectTimes = (value, target) => {
  if (typeof value === "string") {
    const time = parseTime(value);
    if (time) target.add(time);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTimes(item, target));
    return;
  }
  if (!value || typeof value !== "object" || isUnavailableSlot(value)) return;

  const startValue =
    value.hora_inicio ??
    value.horaInicio ??
    value.start_time ??
    value.startTime ??
    value.inicio ??
    value.hora ??
    value.horario ??
    value.fecha_inicio ??
    value.fechaInicio ??
    value.fecha_hora ??
    value.fechaHora;
  if (startValue !== undefined) {
    collectTimes(startValue, target);
    return;
  }

  const nestedKeys = [
    "data",
    "result",
    "results",
    "items",
    "agenda",
    "disponibilidad",
    "horarios",
    "franjas",
    "slots"
  ];
  nestedKeys.forEach((key) => {
    if (value[key] !== undefined) collectTimes(value[key], target);
  });
};

export const normalizeAvailableTimes = (payload) => {
  const times = new Set();
  collectTimes(payload, times);
  return Array.from(times).sort();
};

const mapWithConcurrency = async (items, concurrency, task) => {
  const results = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
};

const findSpecialtyConfig = (settings, specialty) => {
  const entries = settings?.pricingBySpecialty || {};
  return (
    entries[specialty.id] ||
    entries[slugify(specialty.nombre)] ||
    {}
  );
};

const resolveCitaTipoId = async (query, specialty, config) => {
  const requested = query.citaTipoId || query.citasTiposId;
  if (requested) return ensureId(requested, "citaTipoId");

  const configured =
    config.citaTipoId ||
    ENV.SOFTWARE_MEDICO_CITA_TIPO_ID ||
    specialty.cita_tipos.find((item) => item.id)?.id;
  if (configured) return ensureId(configured, "citaTipoId");

  const appointmentTypes = await listSoftwareMedicoAppointmentTypes();
  const specialtyName = normalizeWord(specialty.nombre);
  const preferredLabel = specialtyName.includes("odont")
    ? "odontologia"
    : specialtyName.includes("cosmet")
      ? "cosmetologia"
      : specialtyName.includes("medicina general")
        ? "medicina general"
        : "medicina especializada";
  const preferred =
    appointmentTypes.find(
      (item) =>
        normalizeWord(item.nombre).includes(preferredLabel) &&
        normalizeWord(item.tipo) === "primera vez"
    ) ||
    appointmentTypes.find((item) => normalizeWord(item.nombre).includes(preferredLabel)) ||
    appointmentTypes.find((item) => ["primera vez", "consulta"].includes(normalizeWord(item.tipo)));

  const value = preferred?.id;
  if (!value) {
    throw new AppError(
      ERROR_CODES.SOFTWARE_MEDICO_CONFIGURATION_ERROR,
      "No hay un tipo de cita habilitado para consultar la disponibilidad.",
      503
    );
  }
  return ensureId(value, "citaTipoId");
};

const resolveSedeId = async (query) => {
  const configured = query.sedeId || query.centroMedicoSedeId || ENV.SOFTWARE_MEDICO_SEDE_ID;
  if (configured) return ensureId(configured, "sedeId");

  const sites = await listSoftwareMedicoSites();
  if (!sites.length) {
    throw new AppError(
      ERROR_CODES.SOFTWARE_MEDICO_CONFIGURATION_ERROR,
      "No hay una sede habilitada para consultar la disponibilidad.",
      503
    );
  }
  return ensureId(sites[0].id, "sedeId");
};

export const getAgendaDisponibleData = async (query = {}) => {
  const especialidadId = ensureId(
    query.especialidadId ?? query.especialidad_id,
    "especialidadId"
  );
  const medicoId = ensureId(query.medicoId ?? query.medico_id, "medicoId");
  const start = parseDate(query.fechaInicio ?? query.fecha_inicio, "fechaInicio");
  const end = parseDate(query.fechaFin ?? query.fecha_fin, "fechaFin");

  if (start > end) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "fechaInicio no puede ser posterior a fechaFin.",
      400
    );
  }

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
  if (
    !specialists.some((specialist) => specialist.id === medicoId) ||
    !isSoftwareMedicoDoctorActive(
      settings.softwareMedicoConfig,
      specialty.id,
      medicoId
    )
  ) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      "El medico no esta habilitado para la especialidad seleccionada.",
      404
    );
  }

  const specialtyConfig = {
    ...findSpecialtyConfig(settings, specialty),
    dias_semana_activos: getSoftwareMedicoActiveWeekdays(
      settings.softwareMedicoConfig,
      specialty.id
    )
  };
  const activeDates = enumerateDates(start, end).filter((date) =>
    isDateEnabled(date, specialtyConfig) &&
    isSoftwareMedicoDoctorAvailableBetween(
      settings.softwareMedicoConfig,
      specialty.id,
      medicoId,
      date
    )
  );

  if (!activeDates.length) {
    return {
      especialidad_id: especialidadId,
      medico_id: medicoId,
      disponibilidad: []
    };
  }

  const citaTipoId = await resolveCitaTipoId(query, specialty, specialtyConfig);
  const sedeId = await resolveSedeId(query);
  const days = await mapWithConcurrency(activeDates, 4, async (fecha) => ({
    fecha,
    horarios: normalizeAvailableTimes(
      await getSoftwareMedicoAvailability({
        especialidadId,
        medicoId,
        citaTipoId,
        sedeId,
        fecha
      })
    )
  }));

  return {
    especialidad_id: especialidadId,
    medico_id: medicoId,
    disponibilidad: days.filter((day) => day.horarios.length > 0)
  };
};
