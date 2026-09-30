import { handle } from "../../shared/handler.js";
import { getAuthenticatedUser } from "../../shared/auth-context.js";
import { listAvailableBenefitsForUser } from "../../shared/benefits-service.js";
import { successResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const { userId } = getAuthenticatedUser(event);
  return successResponse({ items: await listAvailableBenefitsForUser(userId) });
});
