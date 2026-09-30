const WEEKDAY_MAP = new Map([
  ["lunes", 1],
  ["lun", 1],
  ["martes", 2],
  ["mar", 2],
  ["miercoles", 3],
  ["mie", 3],
  ["jueves", 4],
  ["jue", 4],
  ["viernes", 5],
  ["vie", 5],
  ["sabado", 6],
  ["sab", 6],
  ["domingo", 0],
  ["dom", 0]
]);

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const parseMonthKey = (monthKey) => {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) {
    throw new Error(`Mes invalido: ${monthKey}`);
  }

  const [year, month] = monthKey.split("-").map(Number);
  return { year, month };
};

const toDateKey = (year, month, day) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const parseWeekdays = (daysText) => {
  const normalized = normalizeText(daysText);
  if (!normalized) {
    return [];
  }

  const rangeMatch = normalized.match(
    /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mar|mie|jue|vie|sab|dom)\b\s+a\s+\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mar|mie|jue|vie|sab|dom)\b/
  );

  if (rangeMatch) {
    const start = WEEKDAY_MAP.get(rangeMatch[1]);
    const end = WEEKDAY_MAP.get(rangeMatch[2]);

    if (start !== undefined && end !== undefined) {
      const startIndex = WEEKDAY_ORDER.indexOf(start);
      const endIndex = WEEKDAY_ORDER.indexOf(end);

      if (startIndex !== -1 && endIndex !== -1) {
        if (startIndex <= endIndex) {
          return WEEKDAY_ORDER.slice(startIndex, endIndex + 1);
        }

        return [...WEEKDAY_ORDER.slice(startIndex), ...WEEKDAY_ORDER.slice(0, endIndex + 1)];
      }
    }
  }

  return Array.from(
    new Set(
      normalized
        .split(/[,/;]| y | e /)
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => WEEKDAY_MAP.get(token))
        .filter((value) => value !== undefined)
    )
  );
};

const expandWholeMonth = (monthKey, weekdays) => {
  const { year, month } = parseMonthKey(monthKey);
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekdays.includes(weekday)) {
      dates.push(toDateKey(year, month, day));
    }
  }

  return dates;
};

const extractDayNumbers = (text) =>
  Array.from(
    new Set(
      (String(text || "").match(/\b\d{1,2}\b/g) || [])
        .map((value) => Number(value))
        .filter((value) => value >= 1 && value <= 31)
    )
  ).sort((a, b) => a - b);

const containsAmbiguousNumericDate = (text) => /\b\d{1,2}\.\d{1,2}\b/.test(String(text || ""));

export const expandDateSelection = ({ monthKey, daysText, datesText }) => {
  const warnings = [];
  const normalizedDatesText = normalizeText(datesText);
  const weekdays = parseWeekdays(daysText);

  if (!normalizedDatesText) {
    warnings.push("La fila no tiene fechas explicitas para generar slots.");
    return { dates: [], warnings };
  }

  if (containsAmbiguousNumericDate(datesText)) {
    warnings.push(
      `Fechas ambiguas detectadas en "${datesText}". Se omitio la fila para evitar errores.`
    );
    return { dates: [], warnings };
  }

  if (normalizedDatesText.includes("todo el mes")) {
    if (weekdays.length === 0) {
      warnings.push(
        `La fila usa "Todo el mes" pero la columna DIAS no se pudo interpretar: "${daysText}".`
      );
      return { dates: [], warnings };
    }

    return {
      dates: expandWholeMonth(monthKey, weekdays),
      warnings
    };
  }

  const dayNumbers = extractDayNumbers(datesText);
  if (dayNumbers.length === 0) {
    warnings.push(`No se encontraron dias validos en "${datesText}".`);
    return { dates: [], warnings };
  }

  const { year, month } = parseMonthKey(monthKey);
  return {
    dates: dayNumbers.map((day) => toDateKey(year, month, day)),
    warnings
  };
};
