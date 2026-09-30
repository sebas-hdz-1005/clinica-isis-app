import test from "node:test";
import assert from "node:assert/strict";
import {
  appointmentStatusToPublicStatus,
  buildPreappointmentView,
  normalizePreappointmentRequest
} from "../../src/shared/preappointments-contract.js";
import {
  buildDashboardPreappointmentSlot,
  findMatchingPreappointmentSlot
} from "../../src/shared/appointments-service.js";

test("normaliza el contrato propio de preagendamiento", () => {
  const result = normalizePreappointmentRequest(
    {
      tipo_documento: "cc",
      numero_documento: "1232888810",
      tipo: 1,
      fecha_estimada: "2026-08-10",
      hora_estimada: "15:00",
      especialidades_id: "1",
      consultorios_id: 1,
      observacion_solicitud: "  Paciente   solicita preagendamiento  "
    },
    new Date("2026-08-01T12:00:00.000Z")
  );

  assert.deepEqual(result, {
    tipo_documento: "CC",
    numero_documento: "1232888810",
    tipo: 1,
    fecha_estimada: "2026-08-10",
    hora_estimada: "15:00:00",
    especialidades_id: 1,
    consultorios_id: 1,
    observacion_solicitud: "Paciente solicita preagendamiento"
  });
});

test("rechaza preagendamientos en una fecha u hora pasada", () => {
  assert.throws(
    () =>
      normalizePreappointmentRequest(
        {
          tipo_documento: "CC",
          numero_documento: "1232888810",
          tipo: 1,
          fecha_estimada: "2026-07-29",
          hora_estimada: "15:00:00",
          especialidades_id: 1,
          consultorios_id: 1
        },
        new Date("2026-08-01T12:00:00.000Z")
      ),
    /horario futuro/
  );
});

test("mapea los estados internos al status publico", () => {
  assert.equal(appointmentStatusToPublicStatus("prebooked"), "preagendada");
  assert.equal(appointmentStatusToPublicStatus("booked"), "agendada");
  assert.equal(appointmentStatusToPublicStatus("cancelled"), "cancelada");
  assert.equal(appointmentStatusToPublicStatus("rejected"), "rechazada");

  assert.deepEqual(
    buildPreappointmentView({
      appointmentId: "appointment-id",
      cedula: "1232888810",
      appointmentStatus: "booked",
      date: "2026-08-10",
      startTime: "15:00",
      specialtyId: "1",
      consultingRoomId: "2"
    }),
    {
      preagendamiento_id: "appointment-id",
      tipo_documento: "CC",
      numero_documento: "1232888810",
      tipo: 1,
      fecha_estimada: "2026-08-10",
      hora_estimada: "15:00:00",
      especialidades_id: 1,
      consultorios_id: 2,
      observacion_solicitud: "",
      status: "agendada"
    }
  );
});

test("encuentra un slot local usando la estructura de Software Medico", () => {
  const request = {
    fecha_estimada: "2026-08-10",
    hora_estimada: "15:00:00",
    especialidades_id: 168,
    consultorios_id: 1
  };
  const specialty = { id: "168", nombre: "COSMETOLOGIA" };
  const selected = findMatchingPreappointmentSlot(
    [
      {
        slotId: "ocupado",
        slotStatus: "booked",
        isActive: true,
        date: "2026-08-10",
        startTime: "15:00",
        specialty: "COSMETOLOGIA",
        specialist: "Dra. A"
      },
      {
        slotId: "consultorio-diferente",
        slotStatus: "available",
        isActive: true,
        date: "2026-08-10",
        startTime: "15:00",
        specialty: "COSMETOLOGIA",
        specialist: "Dra. B",
        consultorios_id: 2
      },
      {
        slotId: "disponible",
        slotStatus: "available",
        isActive: true,
        date: "2026-08-10",
        startTime: "15:00",
        specialty: "COSMETOLOGIA Y ESTETICA",
        specialist: "Dra. C",
        consultorios_id: 1
      }
    ],
    specialty,
    request
  );

  assert.equal(selected?.slotId, "disponible");
});

test("construye un slot propio a partir de la disponibilidad controlada por el dashboard", () => {
  const slot = buildDashboardPreappointmentSlot({
    request: {
      fecha_estimada: "2026-08-03",
      hora_estimada: "16:00:00",
      especialidades_id: 1,
      consultorios_id: 1,
      tipo: 1
    },
    specialty: { id: "1", nombre: "MEDICINA GENERAL" },
    doctor: {
      id: "232",
      first_name: "David",
      last_name: "Guerra Echeverry"
    },
    slotMinutes: 30
  });

  assert.match(slot.slotId, /^dashboard-[a-f0-9]{32}$/);
  assert.equal(slot.startTime, "16:00");
  assert.equal(slot.endTime, "16:30");
  assert.equal(slot.specialtyId, "1");
  assert.equal(slot.specialistId, "232");
  assert.equal(slot.consultoriosId, 1);
  assert.equal(slot.source, "dashboard-software-medico");
  assert.equal(slot.slotStatus, "available");
});
