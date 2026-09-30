import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { ENV } from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { logger } from "./logger.js";

const ses = new SESv2Client({ region: ENV.AWS_REGION });
const CLINIC_SES_SOURCE = "notificacionesapp@clinicaisis.com";
const FALLBACK_NOTIFICATION_DESTINATION = "naabsy.dev@gmail.com";

const buildAppointmentEmail = ({ appointment, patientEmail, patientPhone }) => {
  const subject = `Nueva cita preagendada - ${appointment.patientName || appointment.cedula}`;
  const lines = [
    "Se registro una nueva cita preagendada en Clinica Isis.",
    "",
    `Paciente: ${appointment.patientName || "Sin nombre"}`,
    `Cedula: ${appointment.cedula}`,
    `Correo del paciente: ${patientEmail || "No disponible"}`,
    `Telefono del paciente: ${patientPhone || "No disponible"}`,
    `Especialidad: ${appointment.specialty}`,
    `Especialista: ${appointment.specialist}`,
    `Fecha: ${appointment.date}`,
    `Hora: ${appointment.startTime} - ${appointment.endTime}`,
    `Estado: ${appointment.appointmentStatus}`,
    `Costo: ${appointment.appointmentCost} ${appointment.appointmentCurrency}`,
    `ID cita: ${appointment.appointmentId}`,
    `ID slot: ${appointment.slotId}`,
    "",
    "Por favor hacer seguimiento para confirmar o rechazar la cita."
  ];

  return {
    subject,
    text: lines.join("\n"),
    html: `
      <h2>Nueva cita preagendada</h2>
      <p>Se registro una nueva cita preagendada en Clinica Isis.</p>
      <ul>
        <li><strong>Paciente:</strong> ${appointment.patientName || "Sin nombre"}</li>
        <li><strong>Cedula:</strong> ${appointment.cedula}</li>
        <li><strong>Correo del paciente:</strong> ${patientEmail || "No disponible"}</li>
        <li><strong>Telefono del paciente:</strong> ${patientPhone || "No disponible"}</li>
        <li><strong>Especialidad:</strong> ${appointment.specialty}</li>
        <li><strong>Especialista:</strong> ${appointment.specialist}</li>
        <li><strong>Fecha:</strong> ${appointment.date}</li>
        <li><strong>Hora:</strong> ${appointment.startTime} - ${appointment.endTime}</li>
        <li><strong>Estado:</strong> ${appointment.appointmentStatus}</li>
        <li><strong>Costo:</strong> ${appointment.appointmentCost} ${appointment.appointmentCurrency}</li>
        <li><strong>ID cita:</strong> ${appointment.appointmentId}</li>
        <li><strong>ID slot:</strong> ${appointment.slotId}</li>
      </ul>
      <p>Por favor hacer seguimiento para confirmar o rechazar la cita.</p>
    `
  };
};

export const sendAppointmentPrebookEmail = async ({ appointment, patientEmail, patientPhone }) => {
  const toAddress = FALLBACK_NOTIFICATION_DESTINATION;
  const fromAddress = CLINIC_SES_SOURCE;
  const replyToAddress = String(patientEmail || "").trim();

  if (!toAddress || !fromAddress) {
    return { skipped: true, reason: "missing_email_configuration" };
  }

  const email = buildAppointmentEmail({ appointment, patientEmail, patientPhone });

  try {
    const payload = {
      FromEmailAddress: fromAddress,
      Destination: {
        ToAddresses: [toAddress]
      },
      Content: {
        Simple: {
          Subject: { Data: email.subject },
          Body: {
            Text: { Data: email.text },
            Html: { Data: email.html }
          }
        }
      }
    };

    if (replyToAddress) {
      payload.ReplyToAddresses = [replyToAddress];
    }

    const result = await ses.send(new SendEmailCommand(payload));
    logger.info("Appointment prebook email accepted by SES", {
      toAddress,
      fromAddress,
      replyToAddress: replyToAddress || null,
      appointmentId: appointment.appointmentId,
      messageId: result?.MessageId || null
    });
    return {
      skipped: false,
      provider: "ses",
      toAddress,
      fromAddress,
      replyToAddress: replyToAddress || null,
      messageId: result?.MessageId || null
    };
  } catch (error) {
    throw new AppError(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      "No fue posible enviar el correo interno de preagendamiento.",
      502,
      { errorName: error?.name }
    );
  }
};
