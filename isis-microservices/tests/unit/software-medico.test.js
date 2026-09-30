import test from "node:test";
import assert from "node:assert/strict";
import {
  listSoftwareMedicoSpecialties,
  normalizeSoftwareMedicoSpecialist,
  normalizeSoftwareMedicoSpecialties,
  resetSoftwareMedicoCachesForTests
} from "../../src/shared/software-medico-service.js";
import { normalizeAvailableTimes } from "../../src/shared/agenda-disponible-service.js";
import {
  buildSoftwareMedicoSpecialistAvailability,
  filterAvailabilityBySoftwareMedicoConfig,
  groupSoftwareMedicoAvailabilityBySpecialty,
  resolveAvailabilityDateFilter,
  summarizeAvailabilitySlots
} from "../../src/shared/appointments-service.js";
import { normalizeDiasSemanaActivos } from "../../src/shared/admin-settings-service.js";
import { ENV } from "../../src/shared/constants.js";
import { handler as specialtiesHandler } from "../../src/functions/appointments/get-software-medico-specialties.js";
import { dynamo } from "../../src/shared/dynamodb.js";
import {
  filterActiveSoftwareMedicoCatalog,
  getSoftwareMedicoActiveWeekdays,
  normalizeSoftwareMedicoConfig
} from "../../src/shared/software-medico-config.js";

test("normaliza especialidades y solo conserva medicos habilitados con nombre", () => {
  const result = normalizeSoftwareMedicoSpecialties({
    success: true,
    data: [
      {
        id: 10,
        nombre: "  Medicina   general ",
        especialistas: [
          {
            id: 141,
            first_name: "  Yessica  ",
            last_name: " Diaz   Casas "
          },
          {
            id: 141,
            first_name: "Yessica",
            last_name: "Diaz Casas"
          },
          {
            id: 142,
            first_name: "   ",
            last_name: "Sin nombre"
          },
          {
            id: 143,
            first_name: "Inactivo",
            activo: false
          }
        ],
        cita_tipos: [
          { id: 8, nombre: "Consulta", activo: true },
          { id: 9, nombre: "Inactivo", activo: false }
        ]
      }
    ]
  });

  assert.deepEqual(result, [
    {
      id: "10",
      nombre: "Medicina general",
      codigo: "",
      cita_tipos: [{ id: "8", nombre: "Consulta", tipo: "Consulta" }],
      especialistas: [
        {
          id: "141",
          first_name: "Yessica",
          last_name: "Diaz Casas"
        }
      ]
    }
  ]);
});

test("no expone campos sensibles al normalizar un medico", () => {
  const result = normalizeSoftwareMedicoSpecialist({
    id: "141",
    first_name: "Yessica",
    last_name: "Diaz",
    email_address: "privado@example.com",
    numero_documento: "123456789",
    username: "ydiaz"
  });

  assert.deepEqual(result, {
    id: "141",
    first_name: "Yessica",
    last_name: "Diaz"
  });
});

test("normaliza, deduplica y filtra horarios no disponibles", () => {
  const result = normalizeAvailableTimes({
    success: true,
    data: {
      horarios: [
        { hora_inicio: "2026-08-03 8:00:00", disponible: true },
        { hora_inicio: "08:30", estado: "disponible" },
        { hora_inicio: "08:30:00", disponible: true },
        { hora_inicio: "09:00", ocupado: true },
        { fecha_inicio: "2026-08-03 09:30:00" },
        "10:15 am"
      ]
    }
  });

  assert.deepEqual(result, ["08:00", "08:30", "09:30", "10:15"]);
});

test("dias_semana_activos acepta acentos y elimina duplicados", () => {
  assert.deepEqual(
    normalizeDiasSemanaActivos(["Lunes", "miércoles", "Miercoles", "SÁBADO", "invalido"]),
    ["lunes", "miércoles", "sábado"]
  );
});

test("renueva el token una vez cuando Software Medico informa que vencio", async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    username: ENV.SOFTWARE_MEDICO_USERNAME,
    password: ENV.SOFTWARE_MEDICO_PASSWORD,
    baseUrl: ENV.SOFTWARE_MEDICO_BASE_URL
  };
  const requests = [];
  let loginCount = 0;
  let catalogCount = 0;

  ENV.SOFTWARE_MEDICO_USERNAME = "integration-user";
  ENV.SOFTWARE_MEDICO_PASSWORD = "integration-password";
  ENV.SOFTWARE_MEDICO_BASE_URL = "https://example.test/api/v1/";
  resetSoftwareMedicoCachesForTests();

  globalThis.fetch = async (url, options) => {
    requests.push({
      url: String(url),
      authorization: options.headers.Authorization || "",
      body: options.body || ""
    });

    if (String(url).endsWith("/auth/login")) {
      loginCount += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, data: { token: `token-${loginCount}` } })
      };
    }

    catalogCount += 1;
    if (catalogCount === 1) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            success: false,
            status: 401,
            error_code: "TOKEN_EXPIRED"
          })
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          success: true,
          data: [{ id: 10, nombre: "Medicina general", especialistas: [] }]
        })
    };
  };

  try {
    const specialties = await listSoftwareMedicoSpecialties();
    assert.equal(specialties.length, 1);
    assert.equal(loginCount, 2);
    assert.equal(catalogCount, 2);
    assert.equal(requests.at(-1).authorization, "Bearer token-2");
    assert.match(requests[0].body, /"usuario":"integration-user"/);
    assert.match(requests[0].body, /"clave":"integration-password"/);
  } finally {
    globalThis.fetch = originalFetch;
    ENV.SOFTWARE_MEDICO_USERNAME = originalConfig.username;
    ENV.SOFTWARE_MEDICO_PASSWORD = originalConfig.password;
    ENV.SOFTWARE_MEDICO_BASE_URL = originalConfig.baseUrl;
    resetSoftwareMedicoCachesForTests();
  }
});

test("el endpoint de especialidades incluye medicos normalizados por especialidad", async () => {
  const originalFetch = globalThis.fetch;
  const originalDynamoSend = dynamo.send;
  const originalConfig = {
    username: ENV.SOFTWARE_MEDICO_USERNAME,
    password: ENV.SOFTWARE_MEDICO_PASSWORD,
    baseUrl: ENV.SOFTWARE_MEDICO_BASE_URL
  };

  ENV.SOFTWARE_MEDICO_USERNAME = "integration-user";
  ENV.SOFTWARE_MEDICO_PASSWORD = "integration-password";
  ENV.SOFTWARE_MEDICO_BASE_URL = "https://example.test/api/v1/";
  resetSoftwareMedicoCachesForTests();

  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/login")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, data: { token: "test-token" } })
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          success: true,
          data: [
            {
              id: 1,
              nombre: "Medicina general",
              especialistas: [
                {
                  id: 232,
                  first_name: "David",
                  last_name: "Guerra",
                  email_address: "privado@example.com",
                  numero_documento: "123456789"
                }
              ]
            }
          ]
        })
    };
  };
  dynamo.send = async () => ({ Item: undefined });

  try {
    const response = await specialtiesHandler({}, { awsRequestId: "test" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      especialidades: [
        {
          id: "1",
          nombre: "Medicina general",
          dias_semana_activos: [
            "lunes",
            "martes",
            "miercoles",
            "jueves",
            "viernes",
            "sabado",
            "domingo"
          ],
          medicos: [
            {
              id: "232",
              first_name: "David",
              last_name: "Guerra",
              rango_activo: {}
            }
          ]
        }
      ]
    });
  } finally {
    globalThis.fetch = originalFetch;
    dynamo.send = originalDynamoSend;
    ENV.SOFTWARE_MEDICO_USERNAME = originalConfig.username;
    ENV.SOFTWARE_MEDICO_PASSWORD = originalConfig.password;
    ENV.SOFTWARE_MEDICO_BASE_URL = originalConfig.baseUrl;
    resetSoftwareMedicoCachesForTests();
  }
});

test("la configuracion filtra especialidades y medicos activos para la app", () => {
  const config = normalizeSoftwareMedicoConfig({
    especialidadesActivas: ["1"],
    medicosActivosPorEspecialidad: {
      1: ["232"]
    },
    diasActivosPorEspecialidad: {
      1: ["Lunes", "miércoles", "viernes", "viernes"]
    },
    rangosActivosPorMedico: {
      1: {
        232: {
          fechaInicio: "2026-08-01",
          fechaFin: "2026-08-31"
        }
      }
    }
  });
  const result = filterActiveSoftwareMedicoCatalog(
    [
      {
        id: "1",
        nombre: "Medicina general",
        dias_semana_activos: ["lunes", "miercoles", "viernes"],
        especialistas: [
          { id: "141", first_name: "Yessica", last_name: "Diaz" },
          { id: "232", first_name: "David", last_name: "Guerra" }
        ]
      },
      {
        id: "10",
        nombre: "Ginecologia",
        especialistas: [{ id: "300", first_name: "Medico", last_name: "Prueba" }]
      }
    ],
    config
  );

  assert.deepEqual(result, [
    {
      id: "1",
      nombre: "Medicina general",
      dias_semana_activos: ["lunes", "miercoles", "viernes"],
      especialistas: [
        {
          id: "232",
          first_name: "David",
          last_name: "Guerra",
          rango_activo: {
            fechaInicio: "2026-08-01",
            fechaFin: "2026-08-31"
          }
        }
      ]
    }
  ]);

  assert.deepEqual(
    getSoftwareMedicoActiveWeekdays(config, "1"),
    ["lunes", "miercoles", "viernes"]
  );
});

test("la disponibilidad del Excel respeta especialidades, medicos y dias del dashboard", () => {
  const specialties = [
    {
      id: "168",
      nombre: "COSMETOLOGIA",
      especialistas: [
        {
          id: "156",
          first_name: "Cosmetologia Estetica 1",
          last_name: "(Alejandra)"
        },
        {
          id: "266",
          first_name: "Cosmetologia Estetica 2",
          last_name: "(Ximena)"
        }
      ]
    },
    {
      id: "177",
      nombre: "GINECOLOGIA",
      especialistas: [
        { id: "231", first_name: "Pablo", last_name: "Lopez (Ginecologia)" }
      ]
    },
    {
      id: "172",
      nombre: "CIRUGIA PLASTICA",
      especialistas: [
        { id: "353", first_name: "Daniel Camilo", last_name: "Rivera Munoz" }
      ]
    }
  ];
  const config = {
    especialidadesActivas: ["168", "177"],
    medicosActivosPorEspecialidad: {
      168: ["156"],
      177: ["231"]
    },
    diasActivosPorEspecialidad: {
      168: ["lunes"],
      177: ["martes"]
    }
  };
  const slots = [
    {
      slotId: "active-cosmetology",
      specialty: "COSMETOLOGIA",
      specialist: "Cosmetologia 2 Alejandra",
      date: "2026-07-06"
    },
    {
      slotId: "inactive-doctor",
      specialty: "COSMETOLOGIA",
      specialist: "Cosmetologia 1 Ximena",
      date: "2026-07-06"
    },
    {
      slotId: "active-gynecology",
      specialty: "GINECOLOGIA",
      specialist: "Dr. Pablo Lopez",
      date: "2026-07-07"
    },
    {
      slotId: "inactive-weekday",
      specialty: "GINECOLOGIA",
      specialist: "Dr. Pablo Lopez",
      date: "2026-07-08"
    },
    {
      slotId: "inactive-specialty",
      specialty: "CIRUGIA PLASTICA CORPORAL MAMOPLASTIA",
      specialist: "Dr. Daniel Rivera",
      date: "2026-07-06"
    }
  ];

  const filtered = filterAvailabilityBySoftwareMedicoConfig(
    slots,
    specialties,
    config
  );

  assert.deepEqual(
    filtered.map((slot) => slot.slotId),
    ["active-cosmetology", "active-gynecology"]
  );
  assert.deepEqual(filtered[0].dias_semana_activos, ["lunes"]);
  assert.deepEqual(filtered[1].dias_semana_activos, ["martes"]);
  assert.equal(filtered[0].specialtyId, "168");
  assert.equal(filtered[0].specialistId, "156");
  assert.equal(filtered[0].tipo, 1);
  assert.equal(filtered[0].consultoriosId, 1);

  assert.deepEqual(summarizeAvailabilitySlots(filtered), [
    {
      specialty: "COSMETOLOGIA",
      specialtyKey: "cosmetologia",
      dias_semana_activos: ["lunes"],
      medicos: [
        {
          specialist: "Cosmetologia 2 Alejandra",
          specialistKey: "cosmetologia-2-alejandra"
        }
      ]
    },
    {
      specialty: "GINECOLOGIA",
      specialtyKey: "ginecologia",
      dias_semana_activos: ["martes"],
      medicos: [
        {
          specialist: "Dr. Pablo Lopez",
          specialistKey: "dr-pablo-lopez"
        }
      ]
    }
  ]);
});

test("el resumen de disponibilidad devuelve un registro por especialista con su estado", () => {
  const result = buildSoftwareMedicoSpecialistAvailability(
    [
      {
        id: "168",
        nombre: "COSMETOLOGIA",
        especialistas: [
          {
            id: "156",
            first_name: "Cosmetologia Estetica 1",
            last_name: "(Alejandra)"
          },
          {
            id: "266",
            first_name: "Cosmetologia Estetica 2",
            last_name: "(Ximena)"
          }
        ]
      },
      {
        id: "177",
        nombre: "GINECOLOGIA",
        especialistas: [
          { id: "231", first_name: "Pablo", last_name: "Lopez" }
        ]
      }
    ],
    {
      especialidadesActivas: ["168"],
      medicosActivosPorEspecialidad: {
        168: ["156"],
        177: ["231"]
      },
      diasActivosPorEspecialidad: {
        168: ["lunes"],
        177: ["martes", "jueves"]
      }
    },
    { includeInactive: true }
  );

  assert.deepEqual(
    result.map((item) => ({
      specialtyId: item.specialtyId,
      specialistId: item.specialistId,
      specialtyActive: item.specialtyActive,
      specialistActive: item.specialistActive,
      days: item.dias_semana_activos
    })),
    [
      {
        specialtyId: "168",
        specialistId: "156",
        specialtyActive: true,
        specialistActive: true,
        days: ["lunes"]
      },
      {
        specialtyId: "168",
        specialistId: "266",
        specialtyActive: true,
        specialistActive: false,
        days: ["lunes"]
      },
      {
        specialtyId: "177",
        specialistId: "231",
        specialtyActive: false,
        specialistActive: false,
        days: ["martes", "jueves"]
      }
    ]
  );

  const activeOnly = buildSoftwareMedicoSpecialistAvailability(
    [
      {
        id: "168",
        nombre: "COSMETOLOGIA",
        especialistas: [
          {
            id: "156",
            first_name: "Cosmetologia Estetica 1",
            last_name: "(Alejandra)"
          },
          {
            id: "266",
            first_name: "Cosmetologia Estetica 2",
            last_name: "(Ximena)"
          }
        ]
      }
    ],
    {
      especialidadesActivas: ["168"],
      medicosActivosPorEspecialidad: { 168: ["156"] },
      diasActivosPorEspecialidad: { 168: ["lunes"] }
    }
  );

  assert.deepEqual(
    activeOnly.map((item) => item.specialistId),
    ["156"]
  );
});

test("un especialista activo solo aparece cuando el mes intersecta su rango de trabajo", () => {
  const specialties = [
    {
      id: "168",
      nombre: "COSMETOLOGIA",
      especialistas: [
        {
          id: "156",
          first_name: "Cosmetologia Estetica 1",
          last_name: "(Alejandra)"
        }
      ]
    }
  ];
  const config = {
    especialidadesActivas: ["168"],
    medicosActivosPorEspecialidad: { 168: ["156"] },
    rangosActivosPorMedico: {
      168: {
        156: {
          fechaInicio: "2026-08-15",
          fechaFin: "2026-09-15"
        }
      }
    }
  };

  assert.equal(
    buildSoftwareMedicoSpecialistAvailability(specialties, config, {
      month: "2026-07"
    }).length,
    0
  );

  const available = buildSoftwareMedicoSpecialistAvailability(
    specialties,
    config,
    { month: "2026-08" }
  );
  assert.equal(available.length, 1);
  assert.equal(available[0].fechaInicio, "2026-08-15");
  assert.equal(available[0].fechaFin, "2026-09-15");
});

test("la disponibilidad sin month usa la fecha actual de Colombia", () => {
  assert.equal(
    resolveAvailabilityDateFilter(
      {},
      new Date("2026-07-31T03:00:00.000Z")
    ),
    "2026-07-30"
  );
  assert.equal(
    resolveAvailabilityDateFilter({
      month: "2026-08"
    }),
    ""
  );
  assert.equal(
    resolveAvailabilityDateFilter({
      date: "2026-09-15"
    }),
    "2026-09-15"
  );
});

test("la respuesta compacta agrupa especialistas e incluye tipo de cita, sede y precio", () => {
  const specialists = [
    {
      specialtyId: "168",
      specialty: "COSMETOLOGIA",
      specialtyKey: "cosmetologia",
      specialtyActive: true,
      specialistId: "156",
      specialist: "Cosmetologia Estetica 1 (Alejandra)",
      specialistKey: "cosmetologia-estetica-1-alejandra",
      specialistActive: true,
      fechaInicio: "2026-07-01",
      fechaFin: "2026-07-31",
      dias_semana_activos: ["lunes", "miercoles", "jueves"]
    }
  ];

  assert.deepEqual(
    groupSoftwareMedicoAvailabilityBySpecialty(
      specialists,
      {
        appointmentCost: 2000,
        appointmentCurrency: "COP",
        pricingBySpecialty: {
          cosmetologia: {
            appointmentCost: 85000,
            appointmentCurrency: "COP"
          }
        }
      }
    ),
    [
      {
        specialtyId: "168",
        specialty: "COSMETOLOGIA",
        specialtyKey: "cosmetologia",
        specialtyActive: true,
        citas_tipos_id: 1,
        centro_medico_sede_id: 1,
        appointmentCost: 85000,
        appointmentCurrency: "COP",
        specialists: [
          {
            specialistId: "156",
            specialist: "Cosmetologia Estetica 1 (Alejandra)",
            specialistKey: "cosmetologia-estetica-1-alejandra",
            specialistActive: true,
            fechaInicio: "2026-07-01",
            fechaFin: "2026-07-31",
            dias_semana_activos: ["lunes", "miercoles", "jueves"]
          }
        ]
      }
    ]
  );
});
