import test from "node:test";
import assert from "node:assert/strict";
import {
  matchScheduleToCatalog,
  parseDayList,
  parseTimeRanges,
  parseWeekdays
} from "../../src/shared/agenda-schedule-import.js";
import {
  getSoftwareMedicoDoctorTimeRanges,
  isTimeWithinRanges,
  normalizeSoftwareMedicoConfig
} from "../../src/shared/software-medico-config.js";

const NOVEMBER = "2026-11";

test("parseWeekdays understands lists, ranges and plurals", () => {
  assert.deepEqual([...parseWeekdays("Lunes, Miercoles, Jueves")].sort(), [1, 3, 4]);
  assert.deepEqual([...parseWeekdays("Martes y Viernes")].sort(), [2, 5]);
  assert.deepEqual([...parseWeekdays("Lunes a Viernes")].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual([...parseWeekdays("Sábados")], [6]);
});

test("parseTimeRanges reads the clinic's time formats", () => {
  assert.deepEqual(parseTimeRanges("8:00 am – 2:00 pm"), [{ inicio: "08:00", fin: "14:00" }]);
  assert.deepEqual(parseTimeRanges("01:00 p. m. – 04:00 p. m."), [{ inicio: "13:00", fin: "16:00" }]);
  assert.deepEqual(parseTimeRanges("05:00 pm a 07: 30 pm "), [{ inicio: "17:00", fin: "19:30" }]);
  assert.deepEqual(parseTimeRanges("08:0 am a 02:00 pm "), [{ inicio: "08:00", fin: "14:00" }]);
  assert.deepEqual(
    parseTimeRanges("Controles de 04:00 pm a 05:00 pm \nValoraciones de:  05:00 pm a 07:00 pm "),
    [
      { inicio: "16:00", fin: "17:00", tipo: "Controles" },
      { inicio: "17:00", fin: "19:00", tipo: "Valoraciones" }
    ]
  );
});

test("parseDayList recovers dates that Excel turned into decimals", () => {
  const fridays = parseWeekdays("Viernes");
  assert.deepEqual(parseDayList(13.2, { monthKey: NOVEMBER, weekdays: fridays }).fechas, [
    "2026-11-13",
    "2026-11-20"
  ]);
  assert.deepEqual(parseDayList(19.26, { monthKey: NOVEMBER, weekdays: parseWeekdays("Jueves") }).fechas, [
    "2026-11-19",
    "2026-11-26"
  ]);
  assert.deepEqual(
    parseDayList("07,14,21.28", { monthKey: NOVEMBER, weekdays: parseWeekdays("Sábado") }).fechas,
    ["2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28"]
  );
});

test("matchScheduleToCatalog maps sections to specialties and keeps only valoraciones for VALORACION", () => {
  const catalog = [
    {
      id: "917202",
      nombre: "CIRUGIA PLASTICA MAMARIAS (VALORACION)",
      especialistas: [
        { id: 238, first_name: "Juan Sebastian", last_name: "Orozco Gomez (Cirugía)" },
        { id: 424, first_name: "Juan Sebastian", last_name: "Taborda Londoño (Cirugía)" }
      ]
    },
    {
      id: "1",
      nombre: "MEDICINA GENERAL",
      especialistas: [{ id: 141, first_name: "Yessica", last_name: "Diaz Casas (Medicina)" }]
    }
  ];
  const result = matchScheduleToCatalog(
    {
      monthKey: NOVEMBER,
      warnings: [],
      interpretations: [],
      entries: [
        {
          row: 33,
          section: "CIRUGÍA — MAMOPLASTIA · PEXIA · RECONSTRUCCIÓN MAMARIA",
          names: ["Dr. Juan Sebastián Orozco"],
          tipo: "Valoraciones y Controles",
          fechas: ["2026-11-09"],
          ranges: [
            { inicio: "16:00", fin: "17:00", tipo: "Controles" },
            { inicio: "17:00", fin: "19:00", tipo: "Valoraciones" }
          ]
        },
        {
          row: 4,
          section: "MEDICINA GENERAL Y ESTÉTICA",
          names: ["Dra. Yesica Díaz"],
          tipo: "Consulta",
          fechas: ["2026-11-04"],
          ranges: [{ inicio: "08:00", fin: "14:00" }]
        }
      ]
    },
    catalog
  );

  const surgery = result.specialties.find((item) => item.specialtyId === "917202");
  assert.equal(surgery.doctors.length, 1);
  assert.equal(surgery.doctors[0].doctorId, "238");
  assert.deepEqual(surgery.doctors[0].horarios, [
    { fechas: ["2026-11-09"], inicio: "17:00", fin: "19:00", tipo: "Valoraciones" }
  ]);
  const general = result.specialties.find((item) => item.specialtyId === "1");
  assert.equal(general.doctors[0].doctorId, "141");
  assert.deepEqual(result.unmatched, []);
});

test("doctor schedule limits times only in months that have one", () => {
  const config = normalizeSoftwareMedicoConfig({
    horariosPorMedico: {
      1: { 232: [{ fechas: ["2026-11-03"], inicio: "14:00", fin: "20:00" }] }
    }
  });

  const ranges = getSoftwareMedicoDoctorTimeRanges(config, "1", "232", "2026-11-03");
  assert.deepEqual(ranges, [{ inicio: "14:00", fin: "20:00" }]);
  assert.equal(isTimeWithinRanges(ranges, "08:00"), false);
  assert.equal(isTimeWithinRanges(ranges, "14:00"), true);
  assert.equal(isTimeWithinRanges(ranges, "20:00"), false);
  assert.deepEqual(getSoftwareMedicoDoctorTimeRanges(config, "1", "232", "2026-11-04"), []);
  assert.equal(getSoftwareMedicoDoctorTimeRanges(config, "1", "232", "2026-12-01"), null);
  assert.equal(getSoftwareMedicoDoctorTimeRanges(config, "1", "141", "2026-11-03"), null);
});
