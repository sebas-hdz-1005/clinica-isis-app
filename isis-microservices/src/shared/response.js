import { ENV } from "./constants.js";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": ENV.CORS_ALLOWED_ORIGINS,
  "Access-Control-Allow-Headers": "Content-Type,Authorization,x-api-key",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
};

const build = (statusCode, body) => ({
  statusCode,
  headers: jsonHeaders,
  body: JSON.stringify(body)
});

export const successResponse = (data, statusCode = 200) =>
  build(statusCode, { success: true, data });

export const messageResponse = (message, statusCode = 200, data = undefined) =>
  build(statusCode, data === undefined ? { success: true, message } : { success: true, message, data });

export const errorResponse = (errorCode, message, statusCode = 400, details = null) =>
  build(statusCode, {
    success: false,
    error: {
      code: errorCode,
      message,
      details
    }
  });
