import { AppError, ERROR_CODES } from "./errors.js";

export const parseJsonBody = (event) => {
  if (!event?.body) return {};
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body);
  } catch {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, "El cuerpo de la petición no es JSON válido.", 400);
  }
};

export const validateBody = (body, schema) => {
  const errors = [];
  for (const [field, rules] of Object.entries(schema)) {
    const value = body[field];
    if (rules.required && (value === undefined || value === null || value === "")) {
      errors.push(`${field} es requerido`);
      continue;
    }
    if (value !== undefined && rules.type && typeof value !== rules.type) {
      errors.push(`${field} debe ser ${rules.type}`);
    }
    if (value !== undefined && rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} debe ser uno de: ${rules.enum.join(", ")}`);
    }
  }
  if (errors.length) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, "La petición no cumple las validaciones requeridas.", 400, errors);
  }
  return body;
};

export const parsePagination = (query = {}) => {
  const limit = Number(query.limit ?? 10);
  const skip = Number(query.skip ?? 0);
  if (!Number.isInteger(limit) || !Number.isInteger(skip) || limit < 1 || limit > 50 || skip < 0) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, "Parámetros de paginación inválidos.", 400);
  }
  return { limit, skip };
};
