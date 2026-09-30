import { ENV } from "./constants.js";
import { getItem, putItem } from "./dynamodb.js";
import { normalizeSoftwareMedicoConfig } from "./software-medico-config.js";

const SETTINGS_KEY = {
  PK: "SYSTEM",
  SK: "APPOINTMENTS_CONFIG"
};

const WEEKDAYS = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miércoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sábado",
  domingo: "domingo"
};

export const DEFAULT_ACTIVE_WEEKDAYS = Object.values(WEEKDAYS);

const normalizeWord = (value) =>
  String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const normalizeDiasSemanaActivos = (value) => {
  if (value === undefined) return [...DEFAULT_ACTIVE_WEEKDAYS];
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(normalizeWord).map((day) => WEEKDAYS[day]).filter(Boolean))
  );
};

const normalizeOptionalDate = (value) => {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
};

const normalizeSpecialtyPricing = (pricingBySpecialty = {}) =>
  Object.entries(pricingBySpecialty || {}).reduce((acc, [key, value]) => {
    const specialtyKey = String(key || "").trim();
    if (!specialtyKey || !value || typeof value !== "object") {
      return acc;
    }

    const appointmentCost = Number(value.appointmentCost);
    if (!Number.isFinite(appointmentCost) || appointmentCost < 0) {
      return acc;
    }

    acc[specialtyKey] = {
      specialtyKey,
      specialty: String(value.specialty || specialtyKey).trim() || specialtyKey,
      appointmentCost,
      appointmentCurrency:
        String(value.appointmentCurrency || ENV.DEFAULT_APPOINTMENT_CURRENCY).trim() ||
        ENV.DEFAULT_APPOINTMENT_CURRENCY,
      dias_semana_activos: normalizeDiasSemanaActivos(value.dias_semana_activos),
      ...(normalizeOptionalDate(value.fechaInicio)
        ? { fechaInicio: normalizeOptionalDate(value.fechaInicio) }
        : {}),
      ...(normalizeOptionalDate(value.fechaFin)
        ? { fechaFin: normalizeOptionalDate(value.fechaFin) }
        : {}),
      updatedAt: value.updatedAt || new Date().toISOString()
    };

    return acc;
  }, {});

const DEFAULTS = {
  appointmentCost: ENV.DEFAULT_APPOINTMENT_COST,
  appointmentCurrency: ENV.DEFAULT_APPOINTMENT_CURRENCY,
  slotMinutes: ENV.DEFAULT_SLOT_MINUTES,
  notificationEmail: ENV.APPOINTMENTS_NOTIFICATION_EMAIL || "notificacionesapp@clinicaisis.com",
  notificationsTopic: ENV.FCM_DEFAULT_TOPIC || "all_users",
  pricingBySpecialty: {},
  softwareMedicoConfig: normalizeSoftwareMedicoConfig()
};

export const getAppointmentsAdminSettings = async () => {
  const saved = await getItem(ENV.USERS_TABLE, SETTINGS_KEY);
  return {
    ...DEFAULTS,
    ...saved,
    pricingBySpecialty: normalizeSpecialtyPricing(saved?.pricingBySpecialty || DEFAULTS.pricingBySpecialty),
    softwareMedicoConfig: normalizeSoftwareMedicoConfig(
      saved?.softwareMedicoConfig ?? DEFAULTS.softwareMedicoConfig
    ),
    ...SETTINGS_KEY
  };
};

export const updateAppointmentsAdminSettings = async (payload = {}) => {
  const current = await getAppointmentsAdminSettings();
  const now = new Date().toISOString();
  const next = {
    ...current,
    appointmentCost: Number(payload.appointmentCost ?? current.appointmentCost ?? DEFAULTS.appointmentCost),
    appointmentCurrency: String(
      payload.appointmentCurrency ?? current.appointmentCurrency ?? DEFAULTS.appointmentCurrency
    ).trim() || DEFAULTS.appointmentCurrency,
    slotMinutes: Number(payload.slotMinutes ?? current.slotMinutes ?? DEFAULTS.slotMinutes),
    notificationEmail: String(
      payload.notificationEmail ?? current.notificationEmail ?? DEFAULTS.notificationEmail
    ).trim() || DEFAULTS.notificationEmail,
    notificationsTopic: String(
      payload.notificationsTopic ?? current.notificationsTopic ?? DEFAULTS.notificationsTopic
    ).trim() || DEFAULTS.notificationsTopic,
    pricingBySpecialty: normalizeSpecialtyPricing(
      payload.pricingBySpecialty ?? current.pricingBySpecialty ?? DEFAULTS.pricingBySpecialty
    ),
    softwareMedicoConfig: normalizeSoftwareMedicoConfig(
      payload.softwareMedicoConfig ??
        current.softwareMedicoConfig ??
        DEFAULTS.softwareMedicoConfig
    ),
    updatedAt: now
  };

  await putItem(ENV.USERS_TABLE, next);
  return next;
};
