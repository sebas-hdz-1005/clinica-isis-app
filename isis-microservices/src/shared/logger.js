import { ENV } from "./constants.js";

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = levels[ENV.LOG_LEVEL] ?? levels.info;

const sensitiveKeys = new Set([
  "password",
  "newPassword",
  "accessToken",
  "idToken",
  "refreshToken",
  "authorization",
  "Authorization",
  "code",
  "deviceToken"
]);

export const maskCedula = (value) => {
  if (!value) return value;
  const text = String(value);
  if (text.length <= 4) return "*".repeat(text.length);
  return `${"*".repeat(text.length - 4)}${text.slice(-4)}`;
};

export const sanitize = (value) => {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, current]) => {
      if (sensitiveKeys.has(key)) return [key, "[REDACTED]"];
      if (key.toLowerCase() === "cedula") return [key, maskCedula(current)];
      if (key.toLowerCase().includes("token")) return [key, "[REDACTED]"];
      return [key, sanitize(current)];
    })
  );
};

const write = (level, message, meta = {}) => {
  if (levels[level] > activeLevel) return;
  console[level === "debug" ? "log" : level](
    JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      ...sanitize(meta)
    })
  );
};

export const logger = {
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
  debug: (message, meta) => write("debug", message, meta)
};
