import XLSX from "xlsx";
import { AppError, ERROR_CODES } from "./errors.js";
import { listSoftwareMedicoSpecialties } from "./software-medico-service.js";

// Importa el Excel mensual "Agendas de especialistas" al formato de Agenda activa:
// por especialidad y medico, filas { fechas, inicio, fin, tipo }.

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
];

// Indices de Date#getUTCDay.
const WEEKDAY_INDEX = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6
};
const WEEKDAY_NAMES = Object.keys(WEEKDAY_INDEX).sort(
  (a, b) => (WEEKDAY_INDEX[a] + 6) % 7 - (WEEKDAY_INDEX[b] + 6) % 7
);

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const cleanText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const pad = (value) => String(value).padStart(2, "0");

const daysInMonth = (monthKey) => {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

const toDate = (monthKey, day) => `${monthKey}-${pad(day)}`;

const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

// ---------- Mes ----------

const detectMonth = (rows) => {
  for (const row of rows.slice(0, 5)) {
    const text = normalize(row.join(" "));
    const month = MONTHS.findIndex((name) => text.includes(name));
    const year = text.match(/\b(20\d{2})\b/);
    if (month >= 0 && year) return `${year[1]}-${pad(month + 1)}`;
  }
  return null;
};

// ---------- Dias de la semana ----------

export const parseWeekdays = (value) => {
  const text = normalize(value).replace(/sabados/g, "sabado");
  const range = text.match(
    /(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+a\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)/
  );
  if (range) {
    const from = WEEKDAY_NAMES.indexOf(range[1]);
    const to = WEEKDAY_NAMES.indexOf(range[2]);
    return new Set(WEEKDAY_NAMES.slice(from, to + 1).map((name) => WEEKDAY_INDEX[name]));
  }

  return new Set(
    WEEKDAY_NAMES.filter((name) => new RegExp(`\\b${name}\\b`).test(text)).map(
      (name) => WEEKDAY_INDEX[name]
    )
  );
};

// ---------- Horas ----------

const TIME_TOKEN = /(\d{1,2})(?:\s*:\s*(\d{1,2}))?\s*([ap])\s*\.?\s*m\b\.?/gi;

const toTime = (hours, minutes, meridiem) => {
  let hour = Number(hours) % 12;
  if (meridiem.toLowerCase() === "p") hour += 12;
  const minute = minutes ? (minutes.length === 1 ? `${minutes}0` : minutes) : "00";
  return `${pad(hour)}:${minute}`;
};

const sessionLabel = (text) => {
  const value = normalize(text);
  if (value.includes("valoraci")) return "Valoraciones";
  if (value.includes("control")) return "Controles";
  return "";
};

// "Controles de 04:00 pm a 05:00 pm Valoraciones de: 05:00 pm a 07:00 pm" -> dos franjas.
export const parseTimeRanges = (value, defaultTipo = "") => {
  const text = String(value ?? "");
  const tokens = Array.from(text.matchAll(TIME_TOKEN));
  const ranges = [];
  let cursor = 0;

  for (let index = 0; index + 1 < tokens.length; index += 2) {
    const [start, end] = [tokens[index], tokens[index + 1]];
    const inicio = toTime(start[1], start[2], start[3]);
    const fin = toTime(end[1], end[2], end[3]);
    const tipo = sessionLabel(text.slice(cursor, start.index)) || defaultTipo;
    cursor = end.index + end[0].length;
    if (inicio < fin) ranges.push({ inicio, fin, ...(tipo ? { tipo } : {}) });
  }

  return ranges;
};

const subtractBreak = (ranges, pause) =>
  ranges.flatMap((range) => {
    if (!pause || pause.fin <= range.inicio || pause.inicio >= range.fin) return [range];
    return [
      { ...range, fin: pause.inicio },
      { ...range, inicio: pause.fin }
    ].filter((part) => part.inicio < part.fin);
  });

// ---------- Fechas ----------

// Excel convierte "19,26" en el numero 19.26 y "13,20" en 13.2 (pierde el cero final).
// Cada parte se lee como dia; una parte de un digito despues del punto puede ser
// d o d0, y se elige la que cae en uno de los dias de la semana de la fila.
export const parseDayList = (value, { monthKey, weekdays }) => {
  const original = typeof value === "number" ? String(value) : cleanText(value);
  const parts = Array.from(original.matchAll(/\d+/g));
  const lastDay = daysInMonth(monthKey);
  const ambiguous = /\d\.\d/.test(original);
  const days = [];

  parts.forEach((match, index) => {
    const digits = match[0];
    const afterDot = original[match.index - 1] === ".";
    let candidates = [Number(digits)];

    if (afterDot && digits.length === 1 && index === parts.length - 1) {
      candidates = [Number(digits), Number(digits) * 10];
    }

    const valid = candidates.filter((day) => day >= 1 && day <= lastDay);
    const onWeekday = valid.filter(
      (day) => !weekdays?.size || weekdays.has(weekdayOf(toDate(monthKey, day)))
    );
    const day = onWeekday.length === 1 ? onWeekday[0] : (onWeekday.length ? onWeekday : valid).at(-1);
    if (day) days.push(day);
  });

  return {
    original,
    ambiguous,
    fechas: Array.from(new Set(days)).sort((a, b) => a - b).map((day) => toDate(monthKey, day))
  };
};

const wholeMonth = (monthKey, weekdays) =>
  Array.from({ length: daysInMonth(monthKey) }, (_, index) => toDate(monthKey, index + 1)).filter(
    (date) => weekdays.has(weekdayOf(date))
  );

// ---------- Lectura de la hoja ----------

const findColumns = (row) => {
  const columns = {};
  row.forEach((cell, index) => {
    const value = normalize(cell);
    if (value === "especialista") columns.specialist = index;
    else if (value.startsWith("tipo de sesion")) columns.sessionType = index;
    else if (value.startsWith("dias")) columns.days = index;
    else if (value.startsWith("horario")) columns.schedule = index;
    else if (value.startsWith("fechas")) columns.dates = index;
    else if (value.startsWith("notas")) columns.notes = index;
  });
  return columns;
};

const isHeaderRow = (row) => {
  const values = row.map(normalize);
  return values.includes("especialista") && values.some((value) => value.startsWith("horario"));
};

const filledCells = (row) => row.filter((cell) => cleanText(cell) !== "");

const isDoctorName = (text) => /^(dr|dra)\b\.?/i.test(cleanText(text));

const findAgendaSheet = (workbook) =>
  workbook.SheetNames.find((name) => /agenda/i.test(name)) || workbook.SheetNames[0];

export const parseScheduleWorkbook = ({ buffer, monthKey: fallbackMonth }) => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = findAgendaSheet(workbook);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: true
  });

  const monthKey = detectMonth(rows) || fallbackMonth;
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) {
    throw new Error("No se encontro el mes de la agenda. Incluye el mes y el ano en el titulo del Excel.");
  }

  const entries = [];
  const warnings = [];
  const interpretations = [];
  let section = "";
  let standaloneName = "";
  let lastSpecialist = "";
  let columns = null;

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const filled = filledCells(row);
    if (!filled.length) return;

    if (isHeaderRow(row)) {
      columns = findColumns(row);
      return;
    }

    if (filled.length === 1 && cleanText(row[0])) {
      if (isDoctorName(row[0])) {
        standaloneName = cleanText(row[0]);
        lastSpecialist = "";
      } else {
        section = cleanText(row[0]).replace(/^[^A-Za-zÀ-ſ]+/, "");
        standaloneName = "";
        lastSpecialist = "";
      }
      return;
    }

    if (!columns || columns.schedule === undefined) return;

    const cell = (key) => (columns[key] === undefined ? "" : row[columns[key]]);
    const specialistCell = cleanText(cell("specialist"));
    if (specialistCell) lastSpecialist = specialistCell;
    const names = [lastSpecialist, standaloneName].filter(Boolean);
    const rowTipo = cleanText(cell("sessionType")) || "Consulta";

    if (!names.length) {
      warnings.push({ row: rowNumber, message: "La fila no tiene especialista." });
      return;
    }

    if (normalize(rowTipo) === "cirugia") {
      warnings.push({ row: rowNumber, message: `${names[0]}: fila de cirugias, no es horario de consulta.` });
      return;
    }

    const weekdays = parseWeekdays(cell("days"));
    if (!weekdays.size) {
      warnings.push({ row: rowNumber, message: `${names[0]}: no se entendieron los dias "${cleanText(cell("days"))}".` });
      return;
    }

    const defaultTipo = sessionLabel(rowTipo);
    let ranges = parseTimeRanges(cell("schedule"), defaultTipo);
    if (!ranges.length) {
      warnings.push({ row: rowNumber, message: `${names[0]}: no se entendio el horario "${cleanText(cell("schedule"))}".` });
      return;
    }

    // Pausa de almuerzo escrita en cualquier celda de la fila.
    const lunch = row.map(String).find((value) => /almuerzo/i.test(value));
    if (lunch) {
      const [pause] = parseTimeRanges(lunch);
      ranges = subtractBreak(ranges, pause);
    }

    let fechas;
    const datesValue = cell("dates");
    if (columns.dates === undefined || normalize(datesValue).includes("todo el mes")) {
      fechas = wholeMonth(monthKey, weekdays);
    } else {
      const parsed = parseDayList(datesValue, { monthKey, weekdays });
      if (!parsed.fechas.length) {
        warnings.push({ row: rowNumber, message: `${names[0]}: no se entendieron las fechas "${parsed.original}".` });
        return;
      }
      fechas = parsed.fechas;
      if (parsed.ambiguous) {
        interpretations.push({ row: rowNumber, specialist: names[0], original: parsed.original, fechas });
      }
      const offWeekday = fechas.filter((date) => !weekdays.has(weekdayOf(date)));
      if (offWeekday.length) {
        warnings.push({
          row: rowNumber,
          message: `${names[0]}: ${offWeekday.join(", ")} no cae en ${cleanText(cell("days"))}; se incluye igual.`
        });
      }
    }

    // NOTAS / EXCEPCIONES con numeros: dias en que no atiende (festivos, ausencias).
    const notes = cell("notes");
    if (typeof notes === "number" || /^[\d\s.,y-]+$/.test(cleanText(notes))) {
      const excluded = new Set(parseDayList(notes, { monthKey, weekdays }).fechas);
      fechas = fechas.filter((date) => !excluded.has(date));
    }

    if (!fechas.length) {
      warnings.push({ row: rowNumber, message: `${names[0]}: no quedaron fechas despues de las excepciones.` });
      return;
    }

    entries.push({ row: rowNumber, section, names, tipo: defaultTipo || rowTipo, fechas, ranges });
  });

  return { monthKey, sheetName, entries, warnings, interpretations };
};

// ---------- Cruce con el catalogo de Software Medico ----------

const SECTION_RULES = [
  { test: /medicina general/, specialty: /medicina general/ },
  { test: /medicina general y estetica|medicina estetica/, specialty: /medicina estetica/ },
  { test: /ginecolog/, specialty: /ginecolog/ },
  { test: /medicina interna/, specialty: /medicina interna/ },
  { test: /otorrino/, specialty: /otorrino/ },
  { test: /nutrici/, specialty: /nutrici/ },
  { test: /cosmetolog/, specialty: /cosmetolog/ },
  { test: /(cirugia|cx).*(facial|rinoplast|blefaroplast|lifting|ritidoplast)/, specialty: /cirugia plastica facial/ },
  { test: /(cirugia|cx).*(mamari|mamoplast|pexia)/, specialty: /cirugia plastica mamari/ },
  { test: /(cirugia|cx).*corporal/, specialty: /cirugia plastica corporal/ }
];

const NAME_STOPWORDS = new Set(["dr", "dra", "de", "del", "la", "y", "estetica"]);

const nameTokens = (value) =>
  normalize(value)
    .replace(/\([^)]*\)/g, (match) => ` ${match.slice(1, -1)} `)
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !NAME_STOPWORDS.has(token));

// Tolera una letra de diferencia ("Yesica"/"Yessica", "Marcos"/"Marco").
const similar = (left, right) => {
  if (left === right) return true;
  if (/\d/.test(left) || /\d/.test(right) || Math.min(left.length, right.length) < 4) return false;
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (left.length - i) + (right.length - j) <= 1;
};

const doctorDisplayName = (doctor) =>
  [doctor.first_name, doctor.last_name].filter(Boolean).join(" ").trim() || `Medico ${doctor.id}`;

const findDoctor = (names, doctors) => {
  for (const name of names) {
    const tokens = nameTokens(name);
    const scored = doctors
      .map((doctor) => {
        const candidate = nameTokens(doctorDisplayName(doctor));
        const score = tokens.filter((token) => candidate.some((other) => similar(token, other))).length;
        return { doctor, score };
      })
      .sort((a, b) => b.score - a.score);

    const [best, second] = scored;
    const needed = Math.min(2, tokens.length);
    if (best && best.score >= needed && (!second || second.score < best.score)) {
      return best.doctor;
    }
  }
  return null;
};

const isValoracionSpecialty = (specialty) => normalize(specialty.nombre).includes("valoracion");

// Devuelve, por especialidad del catalogo, los medicos encontrados con sus filas de horario.
export const matchScheduleToCatalog = (parsed, catalog) => {
  const specialties = {};
  const unmatched = [];

  parsed.entries.forEach((entry) => {
    const section = normalize(entry.section);
    const targets = catalog.filter((specialty) =>
      SECTION_RULES.some(
        (rule) => rule.test.test(section) && rule.specialty.test(normalize(specialty.nombre))
      )
    );

    if (!targets.length) {
      unmatched.push({ row: entry.row, name: entry.names[0], section: entry.section, reason: "Especialidad no encontrada" });
      return;
    }

    let matchedAny = false;
    targets.forEach((specialty) => {
      const doctor = findDoctor(entry.names, specialty.especialistas || []);
      if (!doctor) return;
      matchedAny = true;

      // Las especialidades "(VALORACION)" solo toman horas de valoracion, no de controles.
      const ranges = isValoracionSpecialty(specialty)
        ? entry.ranges.filter((range) => range.tipo !== "Controles")
        : entry.ranges;
      if (!ranges.length) return;

      const specialtyId = String(specialty.id);
      const doctorId = String(doctor.id);
      specialties[specialtyId] ||= { specialtyId, specialty: specialty.nombre, doctors: {} };
      specialties[specialtyId].doctors[doctorId] ||= {
        doctorId,
        doctorName: doctorDisplayName(doctor),
        excelName: entry.names[0],
        horarios: []
      };
      ranges.forEach((range) => {
        specialties[specialtyId].doctors[doctorId].horarios.push({
          fechas: entry.fechas,
          inicio: range.inicio,
          fin: range.fin,
          ...(range.tipo || entry.tipo ? { tipo: range.tipo || entry.tipo } : {})
        });
      });
    });

    if (!matchedAny) {
      unmatched.push({ row: entry.row, name: entry.names[0], section: entry.section, reason: "Medico no encontrado en Software Medico" });
    }
  });

  return {
    monthKey: parsed.monthKey,
    specialties: Object.values(specialties).map((item) => ({
      ...item,
      doctors: Object.values(item.doctors)
    })),
    unmatched,
    warnings: parsed.warnings,
    interpretations: parsed.interpretations
  };
};

// Vista previa para Agenda activa: no guarda nada, el administrador revisa y guarda.
export const previewAgendaSchedule = async ({ fileBase64, month }) => {
  const buffer = Buffer.from(String(fileBase64 || ""), "base64");
  if (!buffer.length) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, "Adjunta el Excel de la agenda.", 400);
  }

  let parsed;
  try {
    parsed = parseScheduleWorkbook({ buffer, monthKey: month });
  } catch (error) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, error.message || "No fue posible leer el Excel.", 400);
  }

  return matchScheduleToCatalog(parsed, await listSoftwareMedicoSpecialties());
};
