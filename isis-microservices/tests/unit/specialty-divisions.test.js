import test from "node:test";
import assert from "node:assert/strict";
import {
  expandSpecialtyDivisions,
  resolveProviderSpecialtyId
} from "../../src/shared/specialty-divisions.js";
import { buildDashboardPreappointmentSlot } from "../../src/shared/appointments-service.js";
import { filterActiveSoftwareMedicoCatalog } from "../../src/shared/software-medico-config.js";
import { getAgendaDisponibleData } from "../../src/shared/agenda-disponible-service.js";
import { resetSoftwareMedicoCachesForTests } from "../../src/shared/software-medico-service.js";
import { ENV } from "../../src/shared/constants.js";
import { dynamo } from "../../src/shared/dynamodb.js";

const plasticSurgery = {
  id: "172",
  nombre: "CIRUGIA PLASTICA",
  codigo: "",
  cita_tipos: [{ id: "3", nombre: "Consulta", tipo: "Primera vez" }],
  especialistas: [
    { id: "177", first_name: "Boris", last_name: "Ramirez" },
    { id: "240", first_name: "Carlos", last_name: "Rondon" }
  ]
};
const general = { id: "1", nombre: "MEDICINA GENERAL", cita_tipos: [], especialistas: [] };

test("divide cirugia plastica en tres especialidades con los mismos medicos", () => {
  const result = expandSpecialtyDivisions([general, plasticSurgery]);

  assert.deepEqual(
    result.map((item) => [item.id, item.nombre]),
    [
      ["1", "MEDICINA GENERAL"],
      ["917201", "CIRUGIA PLASTICA FACIAL (*VALORACION)"],
      ["917202", "CIRUGIA PLASTICA MAMARIAS (*VALORACION)"],
      ["917203", "CIRUGIA PLASTICA CORPORAL (*VALORACION)"]
    ]
  );
  result.slice(1).forEach((division) => {
    assert.equal(division.providerSpecialtyId, "172");
    assert.equal(resolveProviderSpecialtyId(division), "172");
    assert.deepEqual(division.especialistas, plasticSurgery.especialistas);
    assert.notEqual(division.especialistas, plasticSurgery.especialistas);
  });
  assert.equal(resolveProviderSpecialtyId(general), "1");
});

test("cada division se configura por separado en agenda activa", () => {
  const [facial, mamarias, corporal] = expandSpecialtyDivisions([plasticSurgery]);
  const result = filterActiveSoftwareMedicoCatalog([facial, mamarias, corporal], {
    especialidadesActivas: ["917201", "917202"],
    medicosActivosPorEspecialidad: {
      "917201": ["177", "240"],
      "917202": ["240"]
    }
  });

  assert.deepEqual(
    result.map((item) => [item.id, item.especialistas.map((doctor) => doctor.id)]),
    [
      ["917201", ["177", "240"]],
      ["917202", ["240"]]
    ]
  );
});

test("la misma hora del mismo medico genera el mismo slot en todas las divisiones", () => {
  const [facial, mamarias] = expandSpecialtyDivisions([plasticSurgery]);
  const doctor = plasticSurgery.especialistas[1];
  const request = (especialidadesId, tipo) => ({
    especialidades_id: Number(especialidadesId),
    consultorios_id: 1,
    tipo,
    fecha_estimada: "2030-01-15",
    hora_estimada: "10:00:00"
  });

  const facialSlot = buildDashboardPreappointmentSlot({
    request: request(facial.id, 1),
    specialty: facial,
    doctor
  });
  const mamariasSlot = buildDashboardPreappointmentSlot({
    request: request(mamarias.id, 2),
    specialty: mamarias,
    doctor
  });

  assert.equal(facialSlot.slotId, mamariasSlot.slotId);
  assert.equal(facialSlot.specialtyId, "917201");
  assert.equal(mamariasSlot.specialty, "CIRUGIA PLASTICA MAMARIAS (*VALORACION)");
  assert.equal(facialSlot.providerSpecialtyId, "172");
});

test("las especialidades sin division conservan su identificador de slot", () => {
  const doctor = { id: "50", first_name: "Ana", last_name: "Diaz" };
  const base = {
    especialidades_id: 1,
    consultorios_id: 1,
    tipo: 1,
    fecha_estimada: "2030-01-15",
    hora_estimada: "10:00:00"
  };
  const first = buildDashboardPreappointmentSlot({ request: base, specialty: general, doctor });
  const otherType = buildDashboardPreappointmentSlot({
    request: { ...base, tipo: 2 },
    specialty: general,
    doctor
  });

  assert.notEqual(first.slotId, otherType.slotId);
  assert.equal(first.providerSpecialtyId, "1");
});

test("la agenda de una division consulta la especialidad real y oculta horas ya tomadas", async () => {
  const originalFetch = globalThis.fetch;
  const originalDynamoSend = dynamo.send;
  const originalEnv = {
    username: ENV.SOFTWARE_MEDICO_USERNAME,
    password: ENV.SOFTWARE_MEDICO_PASSWORD,
    baseUrl: ENV.SOFTWARE_MEDICO_BASE_URL,
    slotsTable: ENV.AGENDA_SLOTS_TABLE
  };
  ENV.SOFTWARE_MEDICO_USERNAME = "integration-user";
  ENV.SOFTWARE_MEDICO_PASSWORD = "integration-password";
  ENV.SOFTWARE_MEDICO_BASE_URL = "https://example.test/api/v1/";
  ENV.AGENDA_SLOTS_TABLE = "AgendaSlots";
  resetSoftwareMedicoCachesForTests();

  const agendaQueries = [];
  globalThis.fetch = async (url) => {
    const target = new URL(String(url));
    const json = (payload) => ({ ok: true, status: 200, text: async () => JSON.stringify(payload) });
    if (target.pathname.endsWith("/auth/login")) {
      return json({ success: true, data: { token: "test-token" } });
    }
    if (target.pathname.endsWith("/especialidad")) {
      return json({
        success: true,
        data: [{ id: 172, nombre: "CIRUGIA PLASTICA", especialistas: [{ id: 240, first_name: "Carlos", last_name: "Rondon" }] }]
      });
    }
    agendaQueries.push(Object.fromEntries(target.searchParams));
    return json({ success: true, data: [{ hora_inicio: "09:00" }, { hora_inicio: "10:00" }] });
  };
  dynamo.send = async (command) =>
    command.constructor.name === "QueryCommand"
      ? {
          Items: [
            { slotId: "a", date: "2030-01-15", startTime: "10:00", specialistId: "240", slotStatus: "prebooked", isActive: true },
            { slotId: "b", date: "2030-01-15", startTime: "09:00", specialistId: "240", slotStatus: "available", isActive: true }
          ]
        }
      : { Item: undefined };

  try {
    const result = await getAgendaDisponibleData({
      especialidadId: "917202",
      medicoId: "240",
      fechaInicio: "2030-01-15",
      fechaFin: "2030-01-15",
      citaTipoId: "3",
      sedeId: "1"
    });

    assert.equal(agendaQueries[0].especialidad_id, "172");
    assert.deepEqual(result, {
      especialidad_id: "917202",
      medico_id: "240",
      disponibilidad: [{ fecha: "2030-01-15", horarios: ["09:00"] }]
    });
  } finally {
    globalThis.fetch = originalFetch;
    dynamo.send = originalDynamoSend;
    ENV.SOFTWARE_MEDICO_USERNAME = originalEnv.username;
    ENV.SOFTWARE_MEDICO_PASSWORD = originalEnv.password;
    ENV.SOFTWARE_MEDICO_BASE_URL = originalEnv.baseUrl;
    ENV.AGENDA_SLOTS_TABLE = originalEnv.slotsTable;
    resetSoftwareMedicoCachesForTests();
  }
});
