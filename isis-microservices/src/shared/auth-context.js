import { AppError, ERROR_CODES } from "./errors.js";

export const getAuthClaims = (event) => event?.requestContext?.authorizer?.jwt?.claims || {};

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
    groups: String(claims["cognito:groups"] || "").split(",").filter(Boolean),
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
