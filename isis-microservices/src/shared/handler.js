import { errorResponse } from "./response.js";
import { toHttpError } from "./errors.js";
import { logger } from "./logger.js";

export const handle = (fn) => async (event, context) => {
  try {
    return await fn(event, context);
  } catch (error) {
    const httpError = toHttpError(error);
    logger.error("Handler failed", {
      errorCode: httpError.code,
      message: httpError.message,
      requestId: context?.awsRequestId
    });
    return errorResponse(httpError.code, httpError.message, httpError.statusCode, httpError.details);
  }
};
