const pad = (value) => String(value).padStart(2, "0");

const normalizeSingleTime = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  let value = String(rawValue)
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s*:\s*/g, ":")
    .replace(/\s+/g, "");

  if (!value) {
    return null;
  }

  const suffix = value.endsWith("am") ? "am" : value.endsWith("pm") ? "pm" : "";
  if (suffix) {
    value = value.slice(0, -2);
  }

  if (!value.includes(":")) {
    if (/^\d{3,4}$/.test(value)) {
      value = `${value.slice(0, -2)}:${value.slice(-2)}`;
    } else if (/^\d{1,2}$/.test(value)) {
      value = `${value}:00`;
    }
  }

  const [hoursPart, minutesPart = "00"] = value.split(":");
  let hours = Number(hoursPart);
  const minutes = Number(minutesPart);

  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }

  if (suffix === "am") {
    if (hours === 12) {
      hours = 0;
    }
  } else if (suffix === "pm" && hours < 12) {
    hours += 12;
  }

  if (hours < 0 || hours > 23) {
    return null;
  }

  return `${pad(hours)}:${pad(minutes)}`;
};

export const parseTimeRange = (value) => {
  const text = String(value || "")
    .trim()
    .replace(/\s*:\s*/g, ":");

  if (!text) {
    return { ok: false, warning: "Horario vacio." };
  }

  const matches = text.match(/\d{1,2}(?::\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?/gi) || [];
  if (matches.length < 2) {
    return {
      ok: false,
      warning: `No se pudo interpretar el horario "${text}".`
    };
  }

  const start = normalizeSingleTime(matches[0]);
  const end = normalizeSingleTime(matches[1]);

  if (!start || !end) {
    return {
      ok: false,
      warning: `No se pudo normalizar el horario "${text}".`
    };
  }

  return { ok: true, start, end };
};

const toMinutes = (value) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const fromMinutes = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${pad(hours)}:${pad(minutes)}`;
};

export const generateSlotTimes = (start, end, slotMinutes) => {
  const slots = [];
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);

  if (endMinutes <= startMinutes) {
    return slots;
  }

  for (let cursor = startMinutes; cursor + slotMinutes <= endMinutes; cursor += slotMinutes) {
    slots.push({
      startTime: fromMinutes(cursor),
      endTime: fromMinutes(cursor + slotMinutes)
    });
  }

  return slots;
};
