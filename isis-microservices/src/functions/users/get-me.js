import { handle } from "../../shared/handler.js";
import { getAuthenticatedUser } from "../../shared/auth-context.js";
import { getItem } from "../../shared/dynamodb.js";
import { ENV, STATUS } from "../../shared/constants.js";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { listPatientAppointmentsData } from "../../shared/appointments-service.js";
import { successResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const { userId, groups } = getAuthenticatedUser(event);
  const profile = await getItem(ENV.USERS_TABLE, { PK: `USER#${userId}`, SK: "PROFILE" });

  if (!profile) {
    throw new AppError(ERROR_CODES.PROFILE_NOT_FOUND, "Perfil de usuario no encontrado.", 404);
  }

  if (profile.status !== STATUS.ACTIVE) {
    throw new AppError(ERROR_CODES.USER_INACTIVE, "El usuario esta inactivo.", 403);
  }

  const appointmentsData = await listPatientAppointmentsData(profile.cedula);
  const appointmentCost = Number(profile.appointmentCost ?? ENV.DEFAULT_APPOINTMENT_COST);
  const appointmentCurrency = profile.appointmentCurrency || ENV.DEFAULT_APPOINTMENT_CURRENCY;
  const hasAppointments =
    appointmentsData.upcomingAppointments.length > 0 || appointmentsData.pastAppointments.length > 0;
  const response = {
    userId,
    cedula: profile.cedula,
    documentType: profile.documentType,
    name: profile.name,
    email: profile.email ?? null,
    phone: profile.phone ?? null,
    status: profile.status,
    groups,
    appointmentCost,
    appointmentCurrency,
    tokenAppointmentCost: Number(profile.tokenAppointmentCost ?? appointmentCost),
    isReviewUser: Boolean(profile.isReviewUser),
    hasAppointments,
    upcomingAppointmentsCount: appointmentsData.upcomingAppointments.length,
    prebookedAppointmentsCount: appointmentsData.upcomingPrebookedAppointments.length
  };

  if (hasAppointments) {
    response.nextAppointment = appointmentsData.upcomingAppointments[0] || null;
    response.upcomingAppointments = appointmentsData.upcomingAppointments;
  }

  if (appointmentsData.upcomingPrebookedAppointments.length) {
    response.upcomingPrebookedAppointments = appointmentsData.upcomingPrebookedAppointments;
  }

  return successResponse(response);
});
