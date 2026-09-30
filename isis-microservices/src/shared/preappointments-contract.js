import { APPOINTMENT_STATUSES } from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";

const PUBLIC_STATUSES = {
  [APPOINTMENT_STATUSES.PREBOOKED]: "preagendada",
  [APPOINTMENT_STATUSES.BOOKED]: "agendada",
  [APPOINTMENT_STATUSES.CANCELLED]: "cancelada",
  [APPOINTMENT_STATUSES.REJECTED]: "rechazada"
};

const validationError = (message) =>
  new AppError(ERROR_CODES.VALIDATION_ERROR, message, 400);

const requiredText = (value, field, maxLength = 100) => {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw validationError(`El campo ${field} es obligatorio.`);
  }
  if (normalized.length > maxLength) {
    throw validationError(`El campo ${field} supera la longitud permitida.`);
  }
  return normalized;
};

const positiveInteger = (value, field) => {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized) || Number(normalized) < 1) {
    throw validationError(`El campo ${field} debe ser un identificador numerico positivo.`);
  }
  return Number(normalized);
};

const validDate = (value) => {
  const normalized = requiredText(value, "fecha_estimada", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw validationError("El campo fecha_estimada debe tener formato YYYY-MM-DD.");
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw validationError("El campo fecha_estimada contiene una fecha invalida.");
  }
  return normalized;
};

const validTime = (value) => {
  const normalized = requiredText(value, "hora_estimada", 8);
  const match = normalized.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] || 0) > 59) {
    throw validationError("El campo hora_estimada debe tener formato HH:mm:ss.");
  }
  return `${match[1]}:${match[2]}:${match[3] || "00"}`;
};

export const appointmentStatusToPublicStatus = (status) =>
  PUBLIC_STATUSES[String(status || "").trim().toLowerCase()] || String(status || "").trim().toLowerCase();

export const normalizePreappointmentRequest = (payload = {}, now = new Date()) => {
  const fechaEstimada = validDate(payload.fecha_estimada);
  const horaEstimada = validTime(payload.hora_estimada);
  const requestedAt = new Date(`${fechaEstimada}T${horaEstimada}-05:00`);

  if (Number.isNaN(requestedAt.getTime()) || requestedAt.getTime() <= now.getTime()) {
    throw validationError("La fecha y hora estimadas deben corresponder a un horario futuro.");
  }

  const tipoDocumento = requiredText(payload.tipo_documento, "tipo_documento", 10).toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(tipoDocumento)) {
    throw validationError("El campo tipo_documento contiene caracteres no permitidos.");
  }

  const numeroDocumento = requiredText(payload.numero_documento, "numero_documento", 40);
  if (!/^[A-Za-z0-9.-]+$/.test(numeroDocumento)) {
    throw validationError("El campo numero_documento contiene caracteres no permitidos.");
  }

  const observacion = String(payload.observacion_solicitud ?? "").replace(/\s+/g, " ").trim();
  if (observacion.length > 1000) {
    throw validationError("El campo observacion_solicitud supera la longitud permitida.");
  }

  return {
    tipo_documento: tipoDocumento,
    numero_documento: numeroDocumento,
    tipo: positiveInteger(payload.tipo, "tipo"),
    fecha_estimada: fechaEstimada,
    hora_estimada: horaEstimada,
    especialidades_id: positiveInteger(payload.especialidades_id, "especialidades_id"),
    consultorios_id: positiveInteger(payload.consultorios_id, "consultorios_id"),
    observacion_solicitud: observacion
  };
};

export const buildPreappointmentView = (appointment = {}) => ({
  preagendamiento_id: appointment.appointmentId,
  tipo_documento: appointment.tipo_documento || "CC",
  numero_documento: appointment.numero_documento || appointment.cedula,
  tipo: Number(appointment.tipo || 1),
  fecha_estimada: appointment.fecha_estimada || appointment.date,
  hora_estimada:
    appointment.hora_estimada ||
    (appointment.startTime ? `${appointment.startTime}${String(appointment.startTime).length === 5 ? ":00" : ""}` : null),
  especialidades_id: Number(appointment.especialidades_id || appointment.specialtyId || 0) || null,
  consultorios_id: Number(appointment.consultorios_id || appointment.consultingRoomId || 0) || null,
  observacion_solicitud: appointment.observacion_solicitud || "",
  status: appointmentStatusToPublicStatus(appointment.appointmentStatus)
});
