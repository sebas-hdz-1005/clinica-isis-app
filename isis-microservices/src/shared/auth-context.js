import { AppError, ERROR_CODES } from "./errors.js";

export const getAuthClaims = (event) => event?.requestContext?.authorizer?.jwt?.claims || {};

const normalizeGroups = (groupsClaim) => {
  if (Array.isArray(groupsClaim)) {
    return groupsClaim.map((group) => String(group).trim()).filter(Boolean);
  }

  const rawGroups = String(groupsClaim || "").trim();
  if (!rawGroups) {
    return [];
  }

  return rawGroups
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((group) => group.replace(/^['"\s]+|['"\s]+$/g, "").trim())
    .filter(Boolean);
};

export const getAuthenticatedUser = (event) => {
  const claims = getAuthClaims(event);
  const sub = claims.sub;
  if (!sub) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, "No se pudo identificar el usuario autenticado.", 401);
  }
  return {
    userId: sub,
    username: claims["cognito:username"] || claims.username,
    email: claims.email,
    groups: normalizeGroups(claims["cognito:groups"]),
    claims
  };
};

export const requireAdmin = (event) => {
  const user = getAuthenticatedUser(event);
  if (!user.groups.includes("admin")) {
    throw new AppError(ERROR_CODES.FORBIDDEN, "No tienes permisos para ejecutar esta acción.", 403);
  }
  return user;
};
