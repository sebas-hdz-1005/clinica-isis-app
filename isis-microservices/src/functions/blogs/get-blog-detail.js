import { handle } from "../../shared/handler.js";
import { getBlogBySlug } from "../../shared/contentful.js";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { successResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const slug = event.pathParameters?.slug;
  if (!slug) throw new AppError(ERROR_CODES.VALIDATION_ERROR, "slug es requerido.", 400);
  const data = await getBlogBySlug(slug);
  return successResponse(data);
});
