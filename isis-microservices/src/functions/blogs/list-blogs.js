import { handle } from "../../shared/handler.js";
import { listBlogs } from "../../shared/contentful.js";
import { parsePagination } from "../../shared/validator.js";
import { successResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const pagination = parsePagination(event.queryStringParameters || {});
  const data = await listBlogs(pagination);
  return successResponse(data);
});
