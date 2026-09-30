import crypto from "node:crypto";
import XLSX from "xlsx";
import { expandDateSelection, normalizeText } from "./appointments-normalize-dates.js";
import { generateSlotTimes, parseTimeRange } from "./appointments-normalize-time.js";

const IGNORED_PHRASES = [
  "no hay valoraciones",
  "a definir",
  "agenda segun necesidad",
  "ver programacion"
];

export const sanitizeDisplayText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s*[|]+\s*/g, " ")
    .replace(/\s*[-]{2,}\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

export const slugify = (value) =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const cleanValue = (value) => String(value ?? "").trim();

const findAgendaSheet = (workbook) =>
  workbook.SheetNames.find((name) => /^agenda\b/i.test(name)) || workbook.SheetNames[0];

const findHeaderRow = (rows) =>
  rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeText(cell));
    return (
      normalized.includes("especialista") &&
      normalized.includes("horario") &&
      normalized.some((value) => value.startsWith("fechas"))
    );
  });

const buildColumnMap = (headerRow) => {
  const map = {};

  headerRow.forEach((cell, index) => {
    const normalized = normalizeText(cell);

    if (normalized === "especialista") {
      map.specialist = index;
    } else if (normalized === "tipo de sesion") {
      map.sessionType = index;
    } else if (normalized === "dias") {
      map.days = index;
    } else if (normalized === "horario") {
      map.schedule = index;
    } else if (normalized.startsWith("fechas")) {
      map.dates = index;
    } else if (normalized.startsWith("notas")) {
      map.notes = index;
    }
  });

  return map;
};

const readColumn = (row, index) => (index === undefined ? "" : cleanValue(row[index]));
const isMostlyEmpty = (row) => row.every((cell) => !cleanValue(cell));

const isSectionTitleRow = (row) => {
  const firstText = cleanValue(row[0]);
  if (!firstText) {
    return false;
  }

  const nonEmptyCells = row.filter((cell) => cleanValue(cell));
  if (nonEmptyCells.length !== 1) {
    return false;
  }

  const normalized = normalizeText(firstText);
  if (normalized === "especialista" || normalized.startsWith("fechas")) {
    return false;
  }

  if (/^(dr|dra)\b/.test(normalized)) {
    return false;
  }

  return true;
};

const isStandaloneSpecialistRow = (row) => {
  const firstText = cleanValue(row[0]);
  if (!firstText) {
    return false;
  }

  const nonEmptyCells = row.filter((cell) => cleanValue(cell));
  return nonEmptyCells.length === 1 && /^(dr|dra)\b/i.test(firstText.trim());
};

const isHeaderRepeatRow = (row) => {
  const normalized = row.map((cell) => normalizeText(cell));
  return normalized.includes("especialista") && normalized.includes("horario");
};

const shouldIgnoreRow = (values) => {
  const combined = normalizeText(
    [
      values.specialist,
      values.sessionType,
      values.days,
      values.schedule,
      values.dates,
      values.notes
    ].join(" ")
  );

  return IGNORED_PHRASES.some((phrase) => combined.includes(normalizeText(phrase)));
};

const buildSlotId = (slot) => {
  const hash = crypto.createHash("sha1");
  hash.update(
    [
      slot.monthKey,
      slot.date,
      slot.startTime,
      slot.endTime,
      slugify(slot.specialty),
      slugify(slot.specialist),
      slugify(slot.sessionType)
    ].join("|")
  );
  return hash.digest("hex");
};

const findPreviousSectionTitle = (rows, beforeIndex) => {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row && isSectionTitleRow(row)) {
      return sanitizeDisplayText(row[0]);
    }
  }

  return "";
};

export const parseAgendaExcel = ({ buffer, monthKey, slotMinutes }) => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = findAgendaSheet(workbook);
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false
  });

  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex === -1) {
    throw new Error("No se encontro una fila de encabezados valida en la hoja principal.");
  }

  const headerRow = rows[headerRowIndex];
  const columnMap = buildColumnMap(headerRow);
  const warnings = [];
  const slotsById = new Map();
  let currentSpecialty = findPreviousSectionTitle(rows, headerRowIndex);
  let currentSpecialist = "";

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];

    if (!row || isMostlyEmpty(row)) {
      continue;
    }

    if (isSectionTitleRow(row)) {
      currentSpecialty = sanitizeDisplayText(row[0]);
      currentSpecialist = "";
      continue;
    }

    if (isStandaloneSpecialistRow(row)) {
      currentSpecialist = sanitizeDisplayText(row[0]);
      continue;
    }

    if (isHeaderRepeatRow(row)) {
      continue;
    }

    const values = {
      specialist: readColumn(row, columnMap.specialist),
      sessionType: readColumn(row, columnMap.sessionType),
      days: readColumn(row, columnMap.days),
      schedule: readColumn(row, columnMap.schedule),
      dates: readColumn(row, columnMap.dates),
      notes: readColumn(row, columnMap.notes)
    };

    if (shouldIgnoreRow(values)) {
      continue;
    }

    const specialty = sanitizeDisplayText(currentSpecialty);
    const specialist = sanitizeDisplayText(values.specialist || currentSpecialist);
    const sessionType = sanitizeDisplayText(values.sessionType || "Consulta");
    const notes = sanitizeDisplayText(values.notes || "");

    if (values.specialist) {
      currentSpecialist = specialist;
    }

    if (!specialty) {
      warnings.push({ row: rowIndex + 1, message: "No se detecto la especialidad de la fila." });
      continue;
    }

    if (!specialist) {
      warnings.push({ row: rowIndex + 1, message: "No se detecto especialista para la fila." });
      continue;
    }

    const timeRange = parseTimeRange(values.schedule);
    if (!timeRange.ok) {
      warnings.push({ row: rowIndex + 1, message: timeRange.warning });
      continue;
    }

    const expandedDates = expandDateSelection({
      monthKey,
      daysText: values.days,
      datesText: values.dates
    });

    expandedDates.warnings.forEach((message) => {
      warnings.push({ row: rowIndex + 1, message });
    });

    if (expandedDates.dates.length === 0) {
      continue;
    }

    const slotTimes = generateSlotTimes(timeRange.start, timeRange.end, slotMinutes);
    if (slotTimes.length === 0) {
      warnings.push({
        row: rowIndex + 1,
        message: `El horario "${values.schedule}" no genero slots con duracion ${slotMinutes} minutos.`
      });
      continue;
    }

    expandedDates.dates.forEach((date) => {
      slotTimes.forEach(({ startTime, endTime }) => {
        const slot = {
          monthKey,
          date,
          startTime,
          endTime,
          startsAt: `${date}T${startTime}:00`,
          endsAt: `${date}T${endTime}:00`,
          specialty,
          specialtyKey: slugify(specialty),
          specialist,
          specialistKey: slugify(specialist),
          sessionType,
          notes,
          slotStatus: "available",
          isActive: true
        };

        slot.slotId = buildSlotId(slot);
        slotsById.set(slot.slotId, slot);
      });
    });
  }

  return {
    sheetName: sanitizeDisplayText(sheetName),
    slots: Array.from(slotsById.values()).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    warnings
  };
};
