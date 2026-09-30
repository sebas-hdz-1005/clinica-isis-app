import crypto from "node:crypto";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { batchWriteAll, getItem, putItem, queryAll, scanAll, transactWrite, updateItem } from "./dynamodb.js";
import { APPOINTMENT_STATUSES, ENV } from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { parseAgendaExcel, slugify } from "./appointments-parser.js";
import {
  DEFAULT_ACTIVE_WEEKDAYS,
  getAppointmentsAdminSettings
} from "./admin-settings-service.js";
import { sendAppointmentPrebookEmail } from "./email-service.js";
import { findUserProfileByCedula } from "./users-service.js";
import { logger } from "./logger.js";
import {
  isSoftwareMedicoConfigured,
  listSoftwareMedicoSpecialties
} from "./software-medico-service.js";
import {
  getSoftwareMedicoActiveWeekdays,
  getSoftwareMedicoDoctorActiveRange,
  isSoftwareMedicoDoctorAvailableBetween,
  isSoftwareMedicoDoctorActive,
  isSoftwareMedicoSpecialtyActive,
  isSoftwareMedicoWeekdayActive
} from "./software-medico-config.js";
import {
  appointmentStatusToPublicStatus,
  buildPreappointmentView,
  normalizePreappointmentRequest
} from "./preappointments-contract.js";
import { getAgendaDisponibleData } from "./agenda-disponible-service.js";

const s3 = new S3Client({ region: ENV.AWS_REGION });

const ensureMonth = (month) => {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "El campo month es obligatorio y debe tener formato YYYY-MM.",
      400
    );
  }
};

export const resolveAvailabilityDateFilter = (
  { month, date } = {},
  now = new Date()
) => {
  const requestedDate = String(date || "").trim();
  if (requestedDate) {
    return requestedDate;
  }

  if (String(month || "").trim()) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const safeFileName = (value) => String(value || "agenda.xlsx").replace(/[^a-zA-Z0-9._-]/g, "-");

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
};

const getObjectBuffer = async ({ bucket, key }) => {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) {
    throw new AppError(ERROR_CODES.NOT_FOUND, "No se encontro el archivo de agenda en S3.", 404);
  }

  return Buffer.isBuffer(result.Body) ? result.Body : streamToBuffer(result.Body);
};

const uploadBufferToS3 = async ({ bucket, key, buffer, contentType }) => {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType:
        contentType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    })
  );
};

const buildImportStatus = (summary) => {
  if (summary.conflicts.length > 0) {
    return "completed_with_conflicts";
  }
  if (summary.warnings.length > 0) {
    return "completed_with_warnings";
  }
  return "completed";
};

const resolveSpecialtyPricing = (settings, slot = {}) => {
  const specialtyKey = String(slot.specialtyKey || slugify(slot.specialty) || "").trim();
  const specialtyPricing =
    settings?.pricingBySpecialty?.[slot.specialtyId] ||
    settings?.pricingBySpecialty?.[specialtyKey];

  return {
    specialtyKey,
    appointmentCost: Number(
      specialtyPricing?.appointmentCost ?? slot.appointmentCost ?? settings?.appointmentCost ?? ENV.DEFAULT_APPOINTMENT_COST
    ),
    appointmentCurrency:
      specialtyPricing?.appointmentCurrency ||
      slot.appointmentCurrency ||
      settings?.appointmentCurrency ||
      ENV.DEFAULT_APPOINTMENT_CURRENCY
  };
};

const buildSpecialtySummary = (slots, settings) => {
  const map = new Map();

  slots.forEach((slot) => {
    const specialtyKey = String(slot.specialtyKey || slugify(slot.specialty) || "").trim();
    if (!specialtyKey) {
      return;
    }

    const current = map.get(specialtyKey) || {
      specialtyKey,
      specialty: slot.specialty || specialtyKey,
      total: 0,
      byStatus: {},
      appointmentCost: null,
      appointmentCurrency: null
    };

    const pricing = resolveSpecialtyPricing(settings, slot);
    current.total += 1;
    current.byStatus[slot.slotStatus || "unknown"] = (current.byStatus[slot.slotStatus || "unknown"] || 0) + 1;
    current.appointmentCost = pricing.appointmentCost;
    current.appointmentCurrency = pricing.appointmentCurrency;
    current.dias_semana_activos =
      settings?.pricingBySpecialty?.[specialtyKey]?.dias_semana_activos ||
      DEFAULT_ACTIVE_WEEKDAYS;
    map.set(specialtyKey, current);
  });

  return Array.from(map.values()).sort((a, b) => a.specialty.localeCompare(b.specialty, "es"));
};

const buildSoftwareMedicoSpecialtySummary = (catalog, slots, settings) => {
  const legacyByKey = new Map(
    buildSpecialtySummary(slots, settings).map((item) => [item.specialtyKey, item])
  );

  return catalog.map((specialty) => {
    const specialtyKey = slugify(specialty.nombre);
    const legacy = legacyByKey.get(specialtyKey);
    const configured =
      settings?.pricingBySpecialty?.[specialty.id] ||
      settings?.pricingBySpecialty?.[specialtyKey];
    const pricing = resolveSpecialtyPricing(settings, {
      specialtyKey,
      specialty: specialty.nombre
    });

    return {
      specialtyId: specialty.id,
      specialtyKey,
      specialty: specialty.nombre,
      total: legacy?.total || 0,
      byStatus: legacy?.byStatus || {},
      appointmentCost: Number(configured?.appointmentCost ?? pricing.appointmentCost),
      appointmentCurrency: configured?.appointmentCurrency || pricing.appointmentCurrency,
      dias_semana_activos: getSoftwareMedicoActiveWeekdays(
        settings?.softwareMedicoConfig,
        specialty.id
      ),
      activa: isSoftwareMedicoSpecialtyActive(
        settings?.softwareMedicoConfig,
        specialty.id
      ),
      medicos: specialty.especialistas.map((doctor) => ({
        ...doctor,
        activo: isSoftwareMedicoDoctorActive(
          settings?.softwareMedicoConfig,
          specialty.id,
          doctor.id
        ),
        rango_activo: getSoftwareMedicoDoctorActiveRange(
          settings?.softwareMedicoConfig,
          specialty.id,
          doctor.id
        )
      }))
    };
  });
};

const normalizeAppointment = (item) => ({
  ...item,
  status: appointmentStatusToPublicStatus(item.appointmentStatus),
  appointmentCost: Number(item.appointmentCost || ENV.DEFAULT_APPOINTMENT_COST),
  appointmentCurrency: item.appointmentCurrency || ENV.DEFAULT_APPOINTMENT_CURRENCY,
  patientMessage:
    item.patientMessage ||
    (item.appointmentStatus === APPOINTMENT_STATUSES.PREBOOKED
      ? "Tu cita quedo preagendada y pronto personal de Clinica Isis se estara contactando para confirmarla."
      : null)
});

const fetchMonthSlots = (month) =>
  queryAll({
    TableName: ENV.AGENDA_SLOTS_TABLE,
    IndexName: "MonthIndex",
    KeyConditionExpression: "monthKey = :monthKey",
    ExpressionAttributeValues: {
      ":monthKey": month
    }
  });

const filterAvailableSlots = (items, { specialty, specialist, date } = {}) => {
  const specialtyKey = specialty ? slugify(specialty) : "";
  const specialistKey = specialist ? slugify(specialist) : "";

  return items
    .filter((item) => item.isActive !== false)
    .filter((item) => item.slotStatus === "available")
    .filter((item) => !specialtyKey || item.specialtyKey === specialtyKey)
    .filter((item) => !specialistKey || item.specialistKey === specialistKey)
    .filter((item) => !date || item.date === date)
    .map(normalizeAppointment)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
};

const AVAILABILITY_NAME_STOPWORDS = new Set([
  "dr",
  "dra",
  "doctor",
  "doctora",
  "medico",
  "medica",
  "medicina",
  "estetica",
  "cosmetologia",
  "odontologia",
  "odontologo",
  "odontologa",
  "rehabilitador",
  "rehabilitacion",
  "endodoncia",
  "odontopediatra",
  "odontopediatria",
  "ortodoncista",
  "ortodoncia",
  "cirugia",
  "instrum",
  "nutricion",
  "ginecologia",
  "interna",
  "cabecera",
  "prueba",
  "de",
  "del",
  "la",
  "el"
]);

const comparableNameTokens = (value) =>
  slugify(value)
    .split("-")
    .filter(
      (token) =>
        token &&
        !AVAILABILITY_NAME_STOPWORDS.has(token) &&
        !/^\d+$/.test(token)
    );

const differsByAtMostOneCharacter = (left, right) => {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;

  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    differences += 1;
    if (differences > 1) return false;

    if (left.length > right.length) {
      leftIndex += 1;
    } else if (right.length > left.length) {
      rightIndex += 1;
    } else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return differences + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
};

const namesMatch = (left, right) => {
  const leftTokens = comparableNameTokens(left);
  const rightTokens = comparableNameTokens(right);
  if (!leftTokens.length || !rightTokens.length) return false;

  const matchedTokens = leftTokens.filter((leftToken) =>
    rightTokens.some(
      (rightToken) =>
        leftToken === rightToken ||
        (leftToken.length >= 5 &&
          rightToken.length >= 5 &&
          differsByAtMostOneCharacter(leftToken, rightToken))
    )
  );

  return matchedTokens.length >= Math.min(2, leftTokens.length, rightTokens.length);
};

const specialtyNamesMatch = (slotSpecialty, providerSpecialty) => {
  const slotKey = slugify(slotSpecialty);
  const providerKey = slugify(providerSpecialty);
  if (!slotKey || !providerKey) return false;
  if (
    slotKey === providerKey ||
    slotKey.includes(providerKey) ||
    providerKey.includes(slotKey)
  ) {
    return true;
  }

  if (
    slotKey.includes("cirugia") &&
    /(plastica|mamoplastia|pexia|reconstruccion)/.test(slotKey)
  ) {
    return providerKey.includes("cirugia-plastica");
  }

  if (slotKey.includes("odontologia")) {
    return providerKey === "odontologia";
  }

  if (slotKey.includes("medicina-general") && slotKey.includes("estetica")) {
    return ["medicina-general", "medicina-estetica"].includes(providerKey);
  }

  const slotTokens = new Set(slotKey.split("-"));
  const providerTokens = providerKey
    .split("-")
    .filter((token) => !["y", "de", "del", "la", "el"].includes(token));
  return (
    providerTokens.length > 0 &&
    providerTokens.every((token) => slotTokens.has(token))
  );
};

const weekdayForAvailabilityDate = (value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const weekdays = [
    "domingo",
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado"
  ];
  return weekdays[date.getUTCDay()];
};

export const filterAvailabilityBySoftwareMedicoConfig = (
  slots,
  specialties,
  config
) =>
  slots.flatMap((slot) => {
    const weekday = weekdayForAvailabilityDate(slot.date);
    if (!weekday) return [];

    const doctorMatches = specialties.flatMap((specialty) =>
      (specialty.especialistas || [])
        .filter((doctor) =>
          namesMatch(
            slot.specialist,
            [doctor.first_name, doctor.last_name].filter(Boolean).join(" ")
          )
        )
        .map((doctor) => ({ specialty, doctor }))
    );
    const candidates = doctorMatches.length
      ? doctorMatches
      : specialties
          .filter((specialty) =>
            specialtyNamesMatch(slot.specialty, specialty.nombre)
          )
          .map((specialty) => ({ specialty, doctor: null }));

    const enabledCandidates = candidates.filter(
      ({ specialty, doctor }) =>
        isSoftwareMedicoSpecialtyActive(config, specialty.id) &&
        (!doctor ||
          (isSoftwareMedicoDoctorActive(config, specialty.id, doctor.id) &&
            isSoftwareMedicoDoctorAvailableBetween(
              config,
              specialty.id,
              doctor.id,
              slot.date
            )))
    );

    if (
      !enabledCandidates.some(({ specialty }) =>
        isSoftwareMedicoWeekdayActive(config, specialty.id, weekday)
      )
    ) {
      return [];
    }

    const activeWeekdays = new Set(
      enabledCandidates.flatMap(({ specialty }) =>
        getSoftwareMedicoActiveWeekdays(config, specialty.id)
      )
    );
    const selectedCandidate = enabledCandidates.find(({ specialty }) =>
      isSoftwareMedicoWeekdayActive(config, specialty.id, weekday)
    );

    return [
      {
        ...slot,
        specialtyId: slot.specialtyId || selectedCandidate?.specialty?.id || null,
        specialistId: slot.specialistId || selectedCandidate?.doctor?.id || null,
        tipo: Number(slot.tipo || slot.citas_tipos_id || 1),
        consultoriosId: Number(slot.consultoriosId || slot.consultorios_id || 1),
        dias_semana_activos: [
          "lunes",
          "martes",
          "miercoles",
          "jueves",
          "viernes",
          "sabado",
          "domingo"
        ].filter((day) => activeWeekdays.has(day))
      }
    ];
  });

export const summarizeAvailabilitySlots = (slots) => {
  const weekdays = [
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
    "domingo"
  ];
  const specialties = new Map();

  slots.forEach((slot) => {
    const specialtyKey = slot.specialtyKey || slugify(slot.specialty);
    const current = specialties.get(specialtyKey) || {
      specialty: slot.specialty,
      specialtyKey,
      activeWeekdays: new Set(),
      specialists: new Map()
    };

    (slot.dias_semana_activos || []).forEach((day) =>
      current.activeWeekdays.add(day)
    );
    const specialistKey = slot.specialistKey || slugify(slot.specialist);
    if (specialistKey && !current.specialists.has(specialistKey)) {
      current.specialists.set(specialistKey, {
        specialist: slot.specialist,
        specialistKey
      });
    }
    specialties.set(specialtyKey, current);
  });

  return Array.from(specialties.values())
    .map((specialty) => ({
      specialty: specialty.specialty,
      specialtyKey: specialty.specialtyKey,
      dias_semana_activos: weekdays.filter((day) =>
        specialty.activeWeekdays.has(day)
      ),
      medicos: Array.from(specialty.specialists.values()).sort((left, right) =>
        left.specialist.localeCompare(right.specialist, "es")
      )
    }))
    .sort((left, right) => left.specialty.localeCompare(right.specialty, "es"));
};

export const buildSoftwareMedicoSpecialistAvailability = (
  specialties,
  config,
  {
    specialty,
    specialist,
    month,
    date,
    includeInactive = false
  } = {}
) => {
  const specialtyFilter = specialty ? slugify(specialty) : "";
  const specialistFilter = specialist ? slugify(specialist) : "";
  const periodStart = date || (month ? `${month}-01` : "");
  const periodEnd = date
    ? date
    : month
      ? new Date(
          Date.UTC(
            Number(month.slice(0, 4)),
            Number(month.slice(5, 7)),
            0
          )
        )
          .toISOString()
          .slice(0, 10)
      : "";

  return specialties
    .flatMap((providerSpecialty) => {
      const specialtyKey = slugify(providerSpecialty.nombre);
      const specialtyActive = isSoftwareMedicoSpecialtyActive(
        config,
        providerSpecialty.id
      );
      const activeWeekdays = getSoftwareMedicoActiveWeekdays(
        config,
        providerSpecialty.id
      );

      return (providerSpecialty.especialistas || []).map((doctor) => {
        const specialistName = [doctor.first_name, doctor.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        const specialistKey = slugify(specialistName);
        const doctorSelected = isSoftwareMedicoDoctorActive(
          config,
          providerSpecialty.id,
          doctor.id
        );
        const activeRange = getSoftwareMedicoDoctorActiveRange(
          config,
          providerSpecialty.id,
          doctor.id
        );
        const availableInPeriod = isSoftwareMedicoDoctorAvailableBetween(
          config,
          providerSpecialty.id,
          doctor.id,
          periodStart,
          periodEnd
        );

        return {
          specialtyId: providerSpecialty.id,
          specialty: providerSpecialty.nombre,
          specialtyKey,
          specialtyActive,
          specialistId: doctor.id,
          specialist: specialistName,
          specialistKey,
          specialistActive:
            specialtyActive && doctorSelected && availableInPeriod,
          fechaInicio: activeRange.fechaInicio || null,
          fechaFin: activeRange.fechaFin || null,
          dias_semana_activos: activeWeekdays
        };
      });
    })
    .filter(
      (item) =>
        (includeInactive || item.specialistActive) &&
        (!specialtyFilter ||
          item.specialtyKey === specialtyFilter ||
          item.specialtyKey.includes(specialtyFilter) ||
          specialtyFilter.includes(item.specialtyKey)) &&
        (!specialistFilter ||
          item.specialistKey === specialistFilter ||
          item.specialistKey.includes(specialistFilter) ||
          specialistFilter.includes(item.specialistKey))
    )
    .sort(
      (left, right) =>
        left.specialty.localeCompare(right.specialty, "es") ||
        left.specialist.localeCompare(right.specialist, "es")
    );
};

export const groupSoftwareMedicoAvailabilityBySpecialty = (
  specialists,
  settings = {}
) => {
  const groups = new Map();

  specialists.forEach((item) => {
    const pricing = resolveSpecialtyPricing(settings, item);
    const current = groups.get(item.specialtyId) || {
      specialtyId: item.specialtyId,
      specialty: item.specialty,
      specialtyKey: item.specialtyKey,
      specialtyActive: item.specialtyActive,
      citas_tipos_id: 1,
      centro_medico_sede_id: 1,
      appointmentCost: pricing.appointmentCost,
      appointmentCurrency: pricing.appointmentCurrency,
      specialists: []
    };

    current.specialists.push({
      specialistId: item.specialistId,
      specialist: item.specialist,
      specialistKey: item.specialistKey,
      specialistActive: item.specialistActive,
      fechaInicio: item.fechaInicio,
      fechaFin: item.fechaFin,
      dias_semana_activos: item.dias_semana_activos
    });
    groups.set(item.specialtyId, current);
  });

  return Array.from(groups.values()).sort((left, right) =>
    left.specialty.localeCompare(right.specialty, "es")
  );
};

const resolvePatientProfileForBooking = async (cedula) => {
  try {
    return await findUserProfileByCedula(cedula);
  } catch (error) {
    logger.warn("Patient profile lookup skipped during appointment booking", {
      cedula,
      errorCode: error?.code,
      errorName: error?.name,
      errorMessage: error?.message
    });
    return null;
  }
};

const ensureFutureSlot = (slot, now = new Date()) => {
  const startTime = String(slot?.startTime || "").trim();
  const normalizedTime = startTime.length === 5 ? `${startTime}:00` : startTime;
  const startsAt = new Date(`${slot?.date}T${normalizedTime}-05:00`);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= now.getTime()) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Solo se pueden preagendar horarios futuros.",
      400
    );
  }
};

export const listAvailableSlots = async ({
  month,
  specialty,
  specialist,
  date,
  includeSlots,
  includeInactive
}) => {
  const normalizedMonth = String(month || "").trim();
  const includeSlotDetails =
    String(includeSlots || "").trim().toLowerCase() === "true";
  if (normalizedMonth) {
    ensureMonth(normalizedMonth);
  }
  if (includeSlotDetails && !normalizedMonth) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "El campo month solo es obligatorio cuando includeSlots=true.",
      400
    );
  }
  const effectiveDate = resolveAvailabilityDateFilter({
    month: normalizedMonth,
    date
  });
  const [settings, providerSpecialties] = await Promise.all([
    getAppointmentsAdminSettings(),
    listSoftwareMedicoSpecialties()
  ]);
  const specialists = buildSoftwareMedicoSpecialistAvailability(
    providerSpecialties,
    settings.softwareMedicoConfig,
    {
      specialty,
      specialist,
      month: normalizedMonth,
      date: effectiveDate,
      includeInactive:
        String(includeInactive || "").trim().toLowerCase() === "true"
    }
  );
  const specialties = groupSoftwareMedicoAvailabilityBySpecialty(
    specialists,
    settings
  );

  if (!includeSlotDetails) {
    return { specialties };
  }

  const response = {
    month: normalizedMonth,
    filters: {
      specialty: specialty || null,
      specialist: specialist || null,
      date: effectiveDate || null
    },
    dashboardConfigApplied: true,
    total: specialties.length,
    specialties
  };

  const items = await fetchMonthSlots(normalizedMonth);
  let slots = filterAvailableSlots(items, {
    specialty,
    specialist,
    date: effectiveDate
  });

  if (isSoftwareMedicoConfigured()) {
    try {
      slots = filterAvailabilityBySoftwareMedicoConfig(
        slots,
        providerSpecialties,
        settings.softwareMedicoConfig
      );
    } catch (error) {
      logger.warn("Software Medico availability config fallback enabled", {
        errorCode: error?.code,
        errorName: error?.name,
        errorMessage: error?.message
      });
    }
  }

  return {
    ...response,
    slotTotal: slots.length,
    slots
  };
};

export const listPatientAppointmentsData = async (cedula) => {
  if (!String(cedula || "").trim()) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, "El parametro cedula es obligatorio.", 400);
  }

  const appointments = await queryAll({
    TableName: ENV.APPOINTMENTS_TABLE,
    IndexName: "PatientAppointmentsIndex",
    KeyConditionExpression: "cedula = :cedula",
    ExpressionAttributeValues: {
      ":cedula": cedula
    }
  });

  const normalizedAppointments = appointments.map(normalizeAppointment);
  const now = new Date().toISOString();
  const activeAppointments = normalizedAppointments
    .filter((item) =>
      ![APPOINTMENT_STATUSES.CANCELLED, APPOINTMENT_STATUSES.REJECTED].includes(item.appointmentStatus)
    )
    .sort((a, b) => a.appointmentDateTime.localeCompare(b.appointmentDateTime));

  const confirmedAppointments = activeAppointments.filter(
    (item) => item.appointmentStatus === APPOINTMENT_STATUSES.BOOKED
  );
  const prebookedAppointments = activeAppointments.filter(
    (item) => item.appointmentStatus === APPOINTMENT_STATUSES.PREBOOKED
  );
  const upcomingAppointments = confirmedAppointments.filter((item) => item.appointmentDateTime >= now);
  const upcomingPrebookedAppointments = prebookedAppointments.filter(
    (item) => item.appointmentDateTime >= now
  );
  const pastAppointments = activeAppointments.filter((item) => item.appointmentDateTime < now);

  return {
    cedula,
    total: activeAppointments.length,
    appointments: activeAppointments,
    bookedAppointments: confirmedAppointments,
    prebookedAppointments,
    upcomingAppointments,
    upcomingPrebookedAppointments,
    pastAppointments
  };
};

export const bookAppointment = async ({
  cedula,
  slotId,
  patientName,
  patientEmail,
  patientPhone,
  preappointment = null
}) => {
  const normalizedCedula = String(cedula || "").trim();
  const normalizedSlotId = String(slotId || "").trim();
  const normalizedPatientName = String(patientName || "").trim();
  const normalizedPatientEmail = String(patientEmail || "").trim();
  const normalizedPatientPhone = String(patientPhone || "").trim();

  if (!normalizedCedula || !normalizedSlotId) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Los campos cedula y slotId son obligatorios.",
      400
    );
  }

  const slot = await getItem(ENV.AGENDA_SLOTS_TABLE, { slotId: normalizedSlotId });
  if (!slot || slot.isActive === false) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "El slot solicitado no existe o ya no esta disponible.",
      400
    );
  }

  if (slot.slotStatus !== "available") {
    throw new AppError(ERROR_CODES.FORBIDDEN, "Este horario ya fue tomado por otro usuario.", 409);
  }
  ensureFutureSlot(slot);

  const appointmentId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const settings = await getAppointmentsAdminSettings();
  const patientProfile = await resolvePatientProfileForBooking(normalizedCedula);
  const resolvedPatientName = normalizedPatientName || patientProfile?.name || null;
  const resolvedPatientEmail = normalizedPatientEmail || patientProfile?.email || null;
  const resolvedPatientPhone = normalizedPatientPhone || patientProfile?.phone || null;
  const appointment = {
    appointmentId,
    slotId: slot.slotId,
    cedula: normalizedCedula,
    patientName: resolvedPatientName,
    patientEmail: resolvedPatientEmail,
    patientPhone: resolvedPatientPhone,
    appointmentStatus: APPOINTMENT_STATUSES.PREBOOKED,
    status: appointmentStatusToPublicStatus(APPOINTMENT_STATUSES.PREBOOKED),
    appointmentDateTime: slot.startsAt,
    date: slot.date,
    monthKey: slot.monthKey,
    statusMonthKey: `${APPOINTMENT_STATUSES.PREBOOKED}#${slot.monthKey}`,
    startTime: slot.startTime,
    endTime: slot.endTime,
    specialty: slot.specialty,
    specialtyId: preappointment?.especialidades_id || slot.specialtyId || null,
    specialist: slot.specialist,
    specialistId: slot.specialistId || null,
    sessionType: slot.sessionType,
    consultingRoomId:
      preappointment?.consultorios_id || slot.consultoriosId || slot.consultorios_id || null,
    appointmentCost: Number(slot.appointmentCost || settings.appointmentCost || ENV.DEFAULT_APPOINTMENT_COST),
    appointmentCurrency:
      slot.appointmentCurrency || settings.appointmentCurrency || ENV.DEFAULT_APPOINTMENT_CURRENCY,
    createdAt,
    patientMessage:
      "Tu cita quedo preagendada y pronto personal de Clinica Isis se estara contactando para confirmarla."
  };

  if (preappointment) {
    Object.assign(appointment, preappointment);
  }

  try {
    await transactWrite([
      {
        Update: {
          TableName: ENV.AGENDA_SLOTS_TABLE,
          Key: { slotId: normalizedSlotId },
          ConditionExpression:
            "attribute_exists(slotId) AND isActive = :isActive AND slotStatus = :available",
          UpdateExpression:
            "SET slotStatus = :prebooked, appointmentId = :appointmentId, bookedAt = :bookedAt, cedula = :cedula",
          ExpressionAttributeValues: {
            ":isActive": true,
            ":available": "available",
            ":prebooked": APPOINTMENT_STATUSES.PREBOOKED,
            ":appointmentId": appointmentId,
            ":bookedAt": createdAt,
            ":cedula": normalizedCedula
          }
        }
      },
      {
        Put: {
          TableName: ENV.APPOINTMENTS_TABLE,
          Item: appointment,
          ConditionExpression: "attribute_not_exists(appointmentId)"
        }
      }
    ]);
  } catch (error) {
    if (
      error?.name === "TransactionCanceledException" ||
      error?.name === "ConditionalCheckFailedException"
    ) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "Este horario ya fue tomado por otro usuario.", 409);
    }
    throw error;
  }

  let notificationEmailStatus = { skipped: true, reason: "not_attempted" };
  try {
    notificationEmailStatus = await sendAppointmentPrebookEmail({
      appointment,
      patientEmail: resolvedPatientEmail,
      patientPhone: resolvedPatientPhone
    });
  } catch (error) {
    notificationEmailStatus = {
      skipped: true,
      reason: error?.details?.errorName || error?.message || "email_send_failed"
    };
  }

  return {
    message:
      "Tu cita quedo preagendada y pronto personal de Clinica Isis se estara contactando para confirmarla.",
    appointment,
    notificationEmailStatus
  };
};

export const findMatchingPreappointmentSlot = (slots, specialty, request) => {
  const requestedTime = request.hora_estimada.slice(0, 5);
  return slots
    .filter((slot) => slot.isActive !== false && slot.slotStatus === "available")
    .filter(
      (slot) =>
        slot.date === request.fecha_estimada &&
        String(slot.startTime || "").slice(0, 5) === requestedTime
    )
    .filter(
      (slot) =>
        String(slot.specialtyId || "") === String(request.especialidades_id) ||
        specialtyNamesMatch(slot.specialty, specialty.nombre)
    )
    .filter((slot) => {
      const slotConsultingRoom = slot.consultoriosId || slot.consultorios_id;
      return (
        !slotConsultingRoom ||
        String(slotConsultingRoom) === String(request.consultorios_id)
      );
    })
    .sort(
      (left, right) =>
        String(left.specialist || "").localeCompare(String(right.specialist || ""), "es") ||
        String(left.slotId).localeCompare(String(right.slotId))
    )[0] || null;
};

const addMinutesToTime = (time, minutes) => {
  const [hours, minute] = String(time).split(":").map(Number);
  const total = hours * 60 + minute + Number(minutes || ENV.DEFAULT_SLOT_MINUTES);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export const buildDashboardPreappointmentSlot = ({
  request,
  specialty,
  doctor,
  slotMinutes = ENV.DEFAULT_SLOT_MINUTES
}) => {
  const startTime = request.hora_estimada.slice(0, 5);
  const specialist = [doctor.first_name, doctor.last_name].filter(Boolean).join(" ").trim();
  const identity = [
    request.especialidades_id,
    doctor.id,
    request.consultorios_id,
    request.tipo,
    request.fecha_estimada,
    startTime
  ].join("|");
  const slotId = `dashboard-${crypto.createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;

  return {
    slotId,
    monthKey: request.fecha_estimada.slice(0, 7),
    date: request.fecha_estimada,
    startTime,
    endTime: addMinutesToTime(startTime, slotMinutes),
    startsAt: `${request.fecha_estimada}T${startTime}:00`,
    endsAt: `${request.fecha_estimada}T${addMinutesToTime(startTime, slotMinutes)}:00`,
    specialtyId: String(specialty.id),
    specialty: specialty.nombre,
    specialtyKey: slugify(specialty.nombre),
    specialistId: String(doctor.id),
    specialist,
    specialistKey: slugify(specialist),
    sessionType: "Consulta",
    tipo: request.tipo,
    consultoriosId: request.consultorios_id,
    source: "dashboard-software-medico",
    slotStatus: "available",
    isActive: true,
    createdAt: new Date().toISOString()
  };
};

const resolveDashboardPreappointmentSlot = async ({ request, specialty, settings }) => {
  const requestedTime = request.hora_estimada.slice(0, 5);
  const doctors = (specialty.especialistas || []).filter(
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
        request.fecha_estimada
      )
  );

  for (const doctor of doctors) {
    const agenda = await getAgendaDisponibleData({
      especialidadId: specialty.id,
      medicoId: doctor.id,
      fechaInicio: request.fecha_estimada,
      fechaFin: request.fecha_estimada,
      citaTipoId: request.tipo,
      sedeId: request.consultorios_id
    });
    const day = (agenda.disponibilidad || []).find(
      (item) => item.fecha === request.fecha_estimada
    );
    if (!(day?.horarios || []).includes(requestedTime)) {
      continue;
    }

    const slot = buildDashboardPreappointmentSlot({
      request,
      specialty,
      doctor,
      slotMinutes: settings.slotMinutes
    });
    try {
      await putItem(ENV.AGENDA_SLOTS_TABLE, slot, {
        ConditionExpression: "attribute_not_exists(slotId)"
      });
      return slot;
    } catch (error) {
      if (error?.name !== "ConditionalCheckFailedException") {
        throw error;
      }
      return getItem(ENV.AGENDA_SLOTS_TABLE, { slotId: slot.slotId });
    }
  }

  return null;
};

export const createPreappointment = async (payload) => {
  const request = normalizePreappointmentRequest(payload);
  const month = request.fecha_estimada.slice(0, 7);
  const [slots, specialties, settings] = await Promise.all([
    fetchMonthSlots(month),
    listSoftwareMedicoSpecialties(),
    getAppointmentsAdminSettings()
  ]);
  const specialty = specialties.find(
    (item) => String(item.id) === String(request.especialidades_id)
  );

  if (!specialty) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "La especialidad indicada no existe o no esta habilitada.",
      400
    );
  }

  const selectedSlot =
    findMatchingPreappointmentSlot(slots, specialty, request) ||
    await resolveDashboardPreappointmentSlot({ request, specialty, settings });

  if (!selectedSlot) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "No hay un horario disponible en la agenda del dashboard que coincida con la fecha, hora, especialidad y consultorio solicitados.",
      409
    );
  }

  const result = await bookAppointment({
    cedula: request.numero_documento,
    slotId: selectedSlot.slotId,
    patientName: payload.patientName,
    patientEmail: payload.patientEmail,
    patientPhone: payload.patientPhone,
    preappointment: request
  });

  return {
    ...result,
    preappointment: buildPreappointmentView(result.appointment)
  };
};

export const cancelAppointment = async ({ appointmentId, cedula }) => {
  const normalizedAppointmentId = String(appointmentId || "").trim();
  const normalizedCedula = String(cedula || "").trim();

  if (!normalizedAppointmentId || !normalizedCedula) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Los campos appointmentId y cedula son obligatorios.",
      400
    );
  }

  const appointment = await getItem(ENV.APPOINTMENTS_TABLE, { appointmentId: normalizedAppointmentId });
  if (!appointment || appointment.cedula !== normalizedCedula) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "No se encontro la cita solicitada para la cedula indicada.",
      400
    );
  }

  if (appointment.appointmentStatus === "cancelled") {
    throw new AppError(ERROR_CODES.FORBIDDEN, "La cita ya estaba cancelada.", 409);
  }

  const cancelledAt = new Date().toISOString();

  try {
    await transactWrite([
      {
        Update: {
          TableName: ENV.APPOINTMENTS_TABLE,
          Key: { appointmentId: normalizedAppointmentId },
          ConditionExpression: "appointmentStatus IN (:booked, :prebooked)",
          ExpressionAttributeNames: { "#status": "status" },
          UpdateExpression:
            "SET appointmentStatus = :cancelled, #status = :publicStatus, cancelledAt = :cancelledAt, statusMonthKey = :statusMonthKey",
          ExpressionAttributeValues: {
            ":booked": APPOINTMENT_STATUSES.BOOKED,
            ":prebooked": APPOINTMENT_STATUSES.PREBOOKED,
            ":cancelled": APPOINTMENT_STATUSES.CANCELLED,
            ":publicStatus": appointmentStatusToPublicStatus(APPOINTMENT_STATUSES.CANCELLED),
            ":cancelledAt": cancelledAt,
            ":statusMonthKey": `${APPOINTMENT_STATUSES.CANCELLED}#${appointment.monthKey}`
          }
        }
      },
      {
        Update: {
          TableName: ENV.AGENDA_SLOTS_TABLE,
          Key: { slotId: appointment.slotId },
          ConditionExpression:
            "attribute_exists(slotId) AND appointmentId = :appointmentId AND slotStatus IN (:booked, :prebooked)",
          UpdateExpression: "SET slotStatus = :available REMOVE appointmentId, bookedAt, cedula",
          ExpressionAttributeValues: {
            ":appointmentId": normalizedAppointmentId,
            ":booked": APPOINTMENT_STATUSES.BOOKED,
            ":prebooked": APPOINTMENT_STATUSES.PREBOOKED,
            ":available": "available"
          }
        }
      }
    ]);
  } catch (error) {
    if (
      error?.name === "TransactionCanceledException" ||
      error?.name === "ConditionalCheckFailedException"
    ) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        "No fue posible cancelar la cita porque el estado ya cambio.",
        409
      );
    }
    throw error;
  }

  return {
    message: "Cita cancelada correctamente.",
    appointmentId: normalizedAppointmentId
  };
};

export const listAgendaImportsData = async ({ month, limit = 20 }) => {
  const numericLimit = Number(limit || 20);
  const items = month
    ? await queryAll({
        TableName: ENV.AGENDA_IMPORTS_TABLE,
        IndexName: "MonthIndex",
        KeyConditionExpression: "monthKey = :monthKey",
        ExpressionAttributeValues: {
          ":monthKey": month
        }
      })
    : await scanAll({
        TableName: ENV.AGENDA_IMPORTS_TABLE
      });

  const imports = items
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, numericLimit);

  return {
    total: imports.length,
    imports
  };
};

const queryAppointmentsByStatus = (status, month) =>
  queryAll({
    TableName: ENV.APPOINTMENTS_TABLE,
    IndexName: "StatusMonthIndex",
    KeyConditionExpression: "statusMonthKey = :statusMonthKey",
    ExpressionAttributeValues: {
      ":statusMonthKey": `${status}#${month}`
    }
  });

export const listPendingAppointmentsData = async ({ month }) => {
  ensureMonth(month);

  const appointments = await queryAppointmentsByStatus(APPOINTMENT_STATUSES.PREBOOKED, month);

  return {
    month,
    total: appointments.length,
    appointments: appointments
      .map(normalizeAppointment)
      .sort((a, b) => a.appointmentDateTime.localeCompare(b.appointmentDateTime))
  };
};

export const reviewPrebookedAppointment = async ({ appointmentId, decision, reviewedBy, notes }) => {
  const normalizedAppointmentId = String(appointmentId || "").trim();
  const normalizedDecision = String(decision || "").trim().toLowerCase();

  if (!normalizedAppointmentId || !["approved", "rejected"].includes(normalizedDecision)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Debes enviar appointmentId y una decision valida (approved o rejected).",
      400
    );
  }

  const appointment = await getItem(ENV.APPOINTMENTS_TABLE, { appointmentId: normalizedAppointmentId });
  if (!appointment) {
    throw new AppError(ERROR_CODES.NOT_FOUND, "No se encontro la cita indicada.", 404);
  }

  if (appointment.appointmentStatus !== APPOINTMENT_STATUSES.PREBOOKED) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "La cita ya fue procesada previamente.", 409);
  }

  const reviewedAt = new Date().toISOString();
  const nextStatus =
    normalizedDecision === "approved" ? APPOINTMENT_STATUSES.BOOKED : APPOINTMENT_STATUSES.REJECTED;
  const nextSlotStatus =
    normalizedDecision === "approved" ? APPOINTMENT_STATUSES.BOOKED : "available";
  const nextPatientMessage =
    normalizedDecision === "approved"
      ? "Tu cita fue confirmada por Clinica Isis."
      : "Tu cita preagendada no pudo ser confirmada. Pronto personal de Clinica Isis se estara contactando contigo.";

  try {
    await transactWrite([
      {
        Update: {
          TableName: ENV.APPOINTMENTS_TABLE,
          Key: { appointmentId: normalizedAppointmentId },
          ConditionExpression: "appointmentStatus = :prebooked",
          ExpressionAttributeNames: { "#status": "status" },
          UpdateExpression:
            "SET appointmentStatus = :appointmentStatus, #status = :publicStatus, reviewedAt = :reviewedAt, reviewedBy = :reviewedBy, reviewNotes = :reviewNotes, patientMessage = :patientMessage, statusMonthKey = :statusMonthKey",
          ExpressionAttributeValues: {
            ":prebooked": APPOINTMENT_STATUSES.PREBOOKED,
            ":appointmentStatus": nextStatus,
            ":publicStatus": appointmentStatusToPublicStatus(nextStatus),
            ":reviewedAt": reviewedAt,
            ":reviewedBy": reviewedBy || "dashboard",
            ":reviewNotes": notes || null,
            ":patientMessage": nextPatientMessage,
            ":statusMonthKey": `${nextStatus}#${appointment.monthKey}`
          }
        }
      },
      {
        Update: {
          TableName: ENV.AGENDA_SLOTS_TABLE,
          Key: { slotId: appointment.slotId },
          ConditionExpression:
            "attribute_exists(slotId) AND appointmentId = :appointmentId AND slotStatus = :prebooked",
          UpdateExpression:
            nextSlotStatus === "available"
              ? "SET slotStatus = :available REMOVE appointmentId, bookedAt, cedula"
              : "SET slotStatus = :booked",
          ExpressionAttributeValues:
            nextSlotStatus === "available"
              ? {
                  ":appointmentId": normalizedAppointmentId,
                  ":prebooked": APPOINTMENT_STATUSES.PREBOOKED,
                  ":available": "available"
                }
              : {
                  ":appointmentId": normalizedAppointmentId,
                  ":prebooked": APPOINTMENT_STATUSES.PREBOOKED,
                  ":booked": APPOINTMENT_STATUSES.BOOKED
                }
        }
      }
    ]);
  } catch (error) {
    if (
      error?.name === "TransactionCanceledException" ||
      error?.name === "ConditionalCheckFailedException"
    ) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        "No fue posible procesar la cita porque su estado cambio.",
        409
      );
    }
    throw error;
  }

  return {
    message:
      normalizedDecision === "approved"
        ? "La cita quedo confirmada."
        : "La cita fue rechazada y el horario quedo libre nuevamente.",
    appointment: normalizeAppointment({
      ...appointment,
      appointmentStatus: nextStatus,
      reviewedAt,
      reviewedBy: reviewedBy || "dashboard",
      reviewNotes: notes || null,
      patientMessage: nextPatientMessage,
      statusMonthKey: `${nextStatus}#${appointment.monthKey}`
    })
  };
};

export const cancelAppointmentByAdmin = async ({ appointmentId, cancelledBy, reason }) => {
  const normalizedAppointmentId = String(appointmentId || "").trim();

  if (!normalizedAppointmentId) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Debes enviar appointmentId para cancelar la cita.",
      400
    );
  }

  const appointment = await getItem(ENV.APPOINTMENTS_TABLE, { appointmentId: normalizedAppointmentId });
  if (!appointment) {
    throw new AppError(ERROR_CODES.NOT_FOUND, "No se encontro la cita indicada.", 404);
  }

  if (![APPOINTMENT_STATUSES.BOOKED, APPOINTMENT_STATUSES.PREBOOKED].includes(appointment.appointmentStatus)) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "Solo se pueden cancelar citas confirmadas o preagendadas.",
      409
    );
  }

  const cancelledAt = new Date().toISOString();
  const reviewNotes = String(reason || "").trim() || null;
  const cancelledByValue = String(cancelledBy || "").trim() || "dashboard";

  try {
    await transactWrite([
      {
        Update: {
          TableName: ENV.APPOINTMENTS_TABLE,
          Key: { appointmentId: normalizedAppointmentId },
          ConditionExpression: "appointmentStatus IN (:booked, :prebooked)",
          ExpressionAttributeNames: { "#status": "status" },
          UpdateExpression:
            "SET appointmentStatus = :cancelled, #status = :publicStatus, cancelledAt = :cancelledAt, cancelledBy = :cancelledBy, reviewNotes = :reviewNotes, patientMessage = :patientMessage, statusMonthKey = :statusMonthKey",
          ExpressionAttributeValues: {
            ":booked": APPOINTMENT_STATUSES.BOOKED,
            ":prebooked": APPOINTMENT_STATUSES.PREBOOKED,
            ":cancelled": APPOINTMENT_STATUSES.CANCELLED,
            ":publicStatus": appointmentStatusToPublicStatus(APPOINTMENT_STATUSES.CANCELLED),
            ":cancelledAt": cancelledAt,
            ":cancelledBy": cancelledByValue,
            ":reviewNotes": reviewNotes,
            ":patientMessage": "Tu cita fue cancelada por Clinica Isis. Si necesitas ayuda, contactanos para reprogramarla.",
            ":statusMonthKey": `${APPOINTMENT_STATUSES.CANCELLED}#${appointment.monthKey}`
          }
        }
      },
      {
        Update: {
          TableName: ENV.AGENDA_SLOTS_TABLE,
          Key: { slotId: appointment.slotId },
          ConditionExpression:
            "attribute_exists(slotId) AND appointmentId = :appointmentId AND slotStatus IN (:booked, :prebooked)",
          UpdateExpression: "SET slotStatus = :available REMOVE appointmentId, bookedAt, cedula",
          ExpressionAttributeValues: {
            ":appointmentId": normalizedAppointmentId,
            ":booked": APPOINTMENT_STATUSES.BOOKED,
            ":prebooked": APPOINTMENT_STATUSES.PREBOOKED,
            ":available": "available"
          }
        }
      }
    ]);
  } catch (error) {
    if (
      error?.name === "TransactionCanceledException" ||
      error?.name === "ConditionalCheckFailedException"
    ) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        "No fue posible cancelar la cita porque su estado cambio.",
        409
      );
    }
    throw error;
  }

  return {
    message: "La cita fue cancelada y el horario quedo disponible nuevamente.",
    appointment: normalizeAppointment({
      ...appointment,
      appointmentStatus: APPOINTMENT_STATUSES.CANCELLED,
      cancelledAt,
      cancelledBy: cancelledByValue,
      reviewNotes,
      patientMessage: "Tu cita fue cancelada por Clinica Isis. Si necesitas ayuda, contactanos para reprogramarla.",
      statusMonthKey: `${APPOINTMENT_STATUSES.CANCELLED}#${appointment.monthKey}`
    })
  };
};

export const rescheduleAppointmentByAdmin = async ({ appointmentId, slotId, updatedBy, notes }) => {
  const normalizedAppointmentId = String(appointmentId || "").trim();
  const normalizedSlotId = String(slotId || "").trim();

  if (!normalizedAppointmentId || !normalizedSlotId) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Debes enviar appointmentId y slotId para reprogramar la cita.",
      400
    );
  }

  const [appointment, nextSlot] = await Promise.all([
    getItem(ENV.APPOINTMENTS_TABLE, { appointmentId: normalizedAppointmentId }),
    getItem(ENV.AGENDA_SLOTS_TABLE, { slotId: normalizedSlotId })
  ]);

  if (!appointment) {
    throw new AppError(ERROR_CODES.NOT_FOUND, "No se encontro la cita indicada.", 404);
  }

  if (![APPOINTMENT_STATUSES.BOOKED, APPOINTMENT_STATUSES.PREBOOKED].includes(appointment.appointmentStatus)) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "Solo se pueden modificar citas confirmadas o preagendadas.",
      409
    );
  }

  if (!nextSlot || nextSlot.isActive === false) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "El nuevo horario no existe o ya no esta disponible.",
      400
    );
  }

  if (nextSlot.slotStatus !== "available") {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "El nuevo horario ya fue tomado por otro usuario.",
      409
    );
  }

  if (appointment.slotId === normalizedSlotId) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Debes seleccionar un horario diferente al actual.",
      400
    );
  }

  const settings = await getAppointmentsAdminSettings();
  const updatedAt = new Date().toISOString();
  const updatedByValue = String(updatedBy || "").trim() || "dashboard";
  const notesValue = String(notes || "").trim() || null;
  const nextAppointmentCost = Number(
    nextSlot.appointmentCost || settings.appointmentCost || ENV.DEFAULT_APPOINTMENT_COST
  );
  const nextAppointmentCurrency =
    nextSlot.appointmentCurrency || settings.appointmentCurrency || ENV.DEFAULT_APPOINTMENT_CURRENCY;
  const patientMessage =
    appointment.appointmentStatus === APPOINTMENT_STATUSES.BOOKED
      ? "Tu cita fue reprogramada por Clinica Isis."
      : "Tu cita preagendada fue actualizada por Clinica Isis.";

  try {
    await transactWrite([
      {
        Update: {
          TableName: ENV.APPOINTMENTS_TABLE,
          Key: { appointmentId: normalizedAppointmentId },
          ConditionExpression: "appointmentStatus IN (:booked, :prebooked)",
          UpdateExpression:
            "SET slotId = :slotId, appointmentDateTime = :appointmentDateTime, #date = :date, monthKey = :monthKey, statusMonthKey = :statusMonthKey, startTime = :startTime, endTime = :endTime, specialty = :specialty, specialist = :specialist, sessionType = :sessionType, appointmentCost = :appointmentCost, appointmentCurrency = :appointmentCurrency, rescheduledAt = :rescheduledAt, rescheduledBy = :rescheduledBy, reviewNotes = :reviewNotes, patientMessage = :patientMessage",
          ExpressionAttributeNames: {
            "#date": "date"
          },
          ExpressionAttributeValues: {
            ":booked": APPOINTMENT_STATUSES.BOOKED,
            ":prebooked": APPOINTMENT_STATUSES.PREBOOKED,
            ":slotId": nextSlot.slotId,
            ":appointmentDateTime": nextSlot.startsAt,
            ":date": nextSlot.date,
            ":monthKey": nextSlot.monthKey,
            ":statusMonthKey": `${appointment.appointmentStatus}#${nextSlot.monthKey}`,
            ":startTime": nextSlot.startTime,
            ":endTime": nextSlot.endTime,
            ":specialty": nextSlot.specialty,
            ":specialist": nextSlot.specialist,
            ":sessionType": nextSlot.sessionType,
            ":appointmentCost": nextAppointmentCost,
            ":appointmentCurrency": nextAppointmentCurrency,
            ":rescheduledAt": updatedAt,
            ":rescheduledBy": updatedByValue,
            ":reviewNotes": notesValue,
            ":patientMessage": patientMessage
          }
        }
      },
      {
        Update: {
          TableName: ENV.AGENDA_SLOTS_TABLE,
          Key: { slotId: appointment.slotId },
          ConditionExpression:
            "attribute_exists(slotId) AND appointmentId = :appointmentId AND slotStatus IN (:booked, :prebooked)",
          UpdateExpression: "SET slotStatus = :available REMOVE appointmentId, bookedAt, cedula",
          ExpressionAttributeValues: {
            ":appointmentId": normalizedAppointmentId,
            ":booked": APPOINTMENT_STATUSES.BOOKED,
            ":prebooked": APPOINTMENT_STATUSES.PREBOOKED,
            ":available": "available"
          }
        }
      },
      {
        Update: {
          TableName: ENV.AGENDA_SLOTS_TABLE,
          Key: { slotId: nextSlot.slotId },
          ConditionExpression:
            "attribute_exists(slotId) AND isActive = :isActive AND slotStatus = :available",
          UpdateExpression:
            "SET slotStatus = :slotStatus, appointmentId = :appointmentId, bookedAt = :bookedAt, cedula = :cedula",
          ExpressionAttributeValues: {
            ":isActive": true,
            ":available": "available",
            ":slotStatus": appointment.appointmentStatus,
            ":appointmentId": normalizedAppointmentId,
            ":bookedAt": updatedAt,
            ":cedula": appointment.cedula
          }
        }
      }
    ]);
  } catch (error) {
    if (
      error?.name === "TransactionCanceledException" ||
      error?.name === "ConditionalCheckFailedException"
    ) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        "No fue posible modificar la cita porque alguno de los horarios cambio.",
        409
      );
    }
    throw error;
  }

  return {
    message: "La cita fue modificada correctamente.",
    appointment: normalizeAppointment({
      ...appointment,
      slotId: nextSlot.slotId,
      appointmentDateTime: nextSlot.startsAt,
      date: nextSlot.date,
      monthKey: nextSlot.monthKey,
      statusMonthKey: `${appointment.appointmentStatus}#${nextSlot.monthKey}`,
      startTime: nextSlot.startTime,
      endTime: nextSlot.endTime,
      specialty: nextSlot.specialty,
      specialist: nextSlot.specialist,
      sessionType: nextSlot.sessionType,
      appointmentCost: nextAppointmentCost,
      appointmentCurrency: nextAppointmentCurrency,
      rescheduledAt: updatedAt,
      rescheduledBy: updatedByValue,
      reviewNotes: notesValue,
      patientMessage
    })
  };
};

export const getAgendaDashboardData = async ({ month }) => {
  ensureMonth(month);

  const settings = await getAppointmentsAdminSettings();

  const [slots, prebooked, booked, imports] = await Promise.all([
    fetchMonthSlots(month),
    queryAppointmentsByStatus(APPOINTMENT_STATUSES.PREBOOKED, month),
    queryAppointmentsByStatus(APPOINTMENT_STATUSES.BOOKED, month),
    listAgendaImportsData({ month, limit: 12 })
  ]);

  const availableSlots = filterAvailableSlots(slots);
  const availability = {
    month,
    filters: { specialty: null, specialist: null, date: null },
    total: availableSlots.length,
    slots: availableSlots
  };

  const pendingAppointments = prebooked
    .map(normalizeAppointment)
    .sort((a, b) => a.appointmentDateTime.localeCompare(b.appointmentDateTime));
  const pending = {
    month,
    total: pendingAppointments.length,
    appointments: pendingAppointments
  };

  const scheduledAppointments = [...prebooked, ...booked]
    .map(normalizeAppointment)
    .sort((a, b) => a.appointmentDateTime.localeCompare(b.appointmentDateTime));

  const summary = slots.reduce(
    (acc, slot) => {
      const status = slot.slotStatus || "unknown";
      acc.total += 1;
      acc.byStatus[status] = (acc.byStatus[status] || 0) + 1;
      return acc;
    },
    { total: 0, byStatus: {} }
  );

  let specialties = buildSpecialtySummary(slots, settings);

  if (isSoftwareMedicoConfigured()) {
    try {
      const providerSpecialties = await listSoftwareMedicoSpecialties();
      specialties = buildSoftwareMedicoSpecialtySummary(providerSpecialties, slots, settings);
    } catch (error) {
      logger.warn("Software Medico specialties fallback enabled", {
        errorCode: error?.code,
        errorName: error?.name,
        errorMessage: error?.message
      });
    }
  }

  return {
    month,
    summary,
    specialties,
    available: availability,
    pending,
    scheduledAppointments,
    imports: imports.imports
  };
};

export const updateAgendaMonthPricing = async ({
  month,
  specialty,
  specialtyKey,
  appointmentCost,
  appointmentCurrency
}) => {
  ensureMonth(month);

  const normalizedCost = Number(appointmentCost);
  const normalizedCurrency = String(appointmentCurrency || ENV.DEFAULT_APPOINTMENT_CURRENCY).trim();
  const normalizedSpecialtyKey = String(specialtyKey || slugify(specialty) || "").trim();

  if (!Number.isFinite(normalizedCost) || normalizedCost < 0) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "appointmentCost debe ser un numero valido mayor o igual a cero.",
      400
    );
  }

  const settings = await getAppointmentsAdminSettings();
  const updatedAt = new Date().toISOString();
  const nextPricingBySpecialty = normalizedSpecialtyKey
    ? {
        ...(settings.pricingBySpecialty || {}),
        [normalizedSpecialtyKey]: {
          ...(settings.pricingBySpecialty?.[normalizedSpecialtyKey] || {}),
          specialtyKey: normalizedSpecialtyKey,
          specialty: specialty || normalizedSpecialtyKey,
          appointmentCost: normalizedCost,
          appointmentCurrency: normalizedCurrency,
          updatedAt
        }
      }
    : settings.pricingBySpecialty;

  const slots = await queryAll({
    TableName: ENV.AGENDA_SLOTS_TABLE,
    IndexName: "MonthIndex",
    KeyConditionExpression: "monthKey = :monthKey",
    ExpressionAttributeValues: {
      ":monthKey": month
    }
  });

  const targetSlots = normalizedSpecialtyKey
    ? slots.filter((slot) => slot.specialtyKey === normalizedSpecialtyKey)
    : slots;

  if (targetSlots.length > 0) {
    await batchWriteAll(
      ENV.AGENDA_SLOTS_TABLE,
      targetSlots.map((slot) => ({
        ...slot,
        appointmentCost: normalizedCost,
        appointmentCurrency: normalizedCurrency,
        updatedAt
      }))
    );
  }

  if (normalizedSpecialtyKey) {
    await putItem(ENV.USERS_TABLE, {
      ...settings,
      pricingBySpecialty: nextPricingBySpecialty,
      updatedAt
    });
  }

  return {
    month,
    specialty: specialty || targetSlots[0]?.specialty || normalizedSpecialtyKey || null,
    specialtyKey: normalizedSpecialtyKey || null,
    updated: targetSlots.length,
    appointmentCost: normalizedCost,
    appointmentCurrency: normalizedCurrency
  };
};

export const importAgendaData = async ({
  month,
  bucket,
  s3Key,
  fileName,
  fileBase64,
  contentType,
  slotMinutes
}) => {
  ensureMonth(month);

  const targetBucket = String(bucket || ENV.AGENDA_BUCKET_NAME || "").trim();
  if (!targetBucket) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "No se encontro el bucket de agendas configurado.",
      400
    );
  }

  const settings = await getAppointmentsAdminSettings();
  const normalizedSlotMinutes = Number(slotMinutes || settings.slotMinutes || ENV.DEFAULT_SLOT_MINUTES);
  let normalizedS3Key = String(s3Key || "").trim();
  const normalizedFileName = safeFileName(fileName || path.basename(normalizedS3Key || "agenda.xlsx"));
  let buffer;

  if (fileBase64) {
    buffer = Buffer.from(fileBase64, "base64");
    if (!normalizedS3Key) {
      normalizedS3Key = `agendas/raw/${month}/${normalizedFileName}`;
    }

    await uploadBufferToS3({
      bucket: targetBucket,
      key: normalizedS3Key,
      buffer,
      contentType
    });
  } else if (normalizedS3Key) {
    buffer = await getObjectBuffer({
      bucket: targetBucket,
      key: normalizedS3Key
    });
  } else {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Debes enviar s3Key o fileBase64 para importar la agenda.",
      400
    );
  }

  const parsed = parseAgendaExcel({
    buffer,
    monthKey: month,
    slotMinutes: normalizedSlotMinutes
  });

  const existingMonthSlots = await queryAll({
    TableName: ENV.AGENDA_SLOTS_TABLE,
    IndexName: "MonthIndex",
    KeyConditionExpression: "monthKey = :monthKey",
    ExpressionAttributeValues: {
      ":monthKey": month
    }
  });

  const existingById = new Map(existingMonthSlots.map((item) => [item.slotId, item]));
  const importId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const summary = {
    inserted: 0,
    refreshed: 0,
    unchanged: 0,
    deactivated: 0,
    warnings: [...parsed.warnings],
    conflicts: []
  };

  const slotsToInsert = [];
  const slotsToRefresh = [];

  for (const slot of parsed.slots) {
    const specialtyPricing = resolveSpecialtyPricing(settings, slot);
    const existing = existingById.get(slot.slotId);
    if (existing) {
      slotsToRefresh.push({
        ...existing,
        ...slot,
        appointmentCost: specialtyPricing.appointmentCost,
        appointmentCurrency: specialtyPricing.appointmentCurrency,
        importId,
        updatedAt: createdAt,
        isActive: true,
        inactiveReason: undefined
      });
      summary.refreshed += 1;
      continue;
    }

    slotsToInsert.push({
      ...slot,
      appointmentCost: specialtyPricing.appointmentCost,
      appointmentCurrency: specialtyPricing.appointmentCurrency,
      importId,
      createdAt,
      updatedAt: createdAt
    });
  }

  if (slotsToInsert.length > 0) {
    await batchWriteAll(ENV.AGENDA_SLOTS_TABLE, slotsToInsert);
    summary.inserted += slotsToInsert.length;
  }

  if (slotsToRefresh.length > 0) {
    await batchWriteAll(ENV.AGENDA_SLOTS_TABLE, slotsToRefresh);
    summary.unchanged = Math.max(parsed.slots.length - summary.inserted - summary.refreshed, 0);
  }

  const importedIds = new Set(parsed.slots.map((slot) => slot.slotId));
  const slotIdsToDeactivate = [];

  for (const existing of existingMonthSlots) {
    if (importedIds.has(existing.slotId)) {
      continue;
    }

    if (existing.slotStatus === "booked") {
      summary.conflicts.push({
        slotId: existing.slotId,
        startsAt: existing.startsAt,
        specialist: existing.specialist,
        specialty: existing.specialty,
        message: "El nuevo Excel ya no contiene un slot con cita reservada. Se mantiene sin sobrescribir."
      });
      continue;
    }

    if (existing.isActive === false) {
      continue;
    }

    slotIdsToDeactivate.push(existing.slotId);
  }

  await Promise.all(
    slotIdsToDeactivate.map((slotId) =>
      updateItem({
        TableName: ENV.AGENDA_SLOTS_TABLE,
        Key: { slotId },
        UpdateExpression:
          "SET isActive = :isActive, slotStatus = :inactive, updatedAt = :updatedAt, inactiveReason = :inactiveReason",
        ExpressionAttributeValues: {
          ":isActive": false,
          ":inactive": "inactive",
          ":updatedAt": createdAt,
          ":inactiveReason": `Desactivado por importacion ${importId}`
        }
      })
    )
  );
  summary.deactivated = slotIdsToDeactivate.length;

  const importRecord = {
    importId,
    monthKey: month,
    bucket: targetBucket,
    s3Key: normalizedS3Key,
    fileName: normalizedFileName,
    createdAt,
    sheetName: parsed.sheetName,
    slotMinutes: normalizedSlotMinutes,
    status: buildImportStatus(summary),
    summary: {
      totalParsedSlots: parsed.slots.length,
      inserted: summary.inserted,
      refreshed: summary.refreshed,
      unchanged: summary.unchanged,
      deactivated: summary.deactivated,
      warningsCount: summary.warnings.length,
      conflictsCount: summary.conflicts.length
    },
    warnings: summary.warnings,
    conflicts: summary.conflicts
  };

  await putItem(ENV.AGENDA_IMPORTS_TABLE, importRecord);

  return {
    message: "Agenda importada correctamente.",
    import: importRecord
  };
};
