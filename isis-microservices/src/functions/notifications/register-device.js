import { handle } from "../../shared/handler.js";
import { getAuthenticatedUser } from "../../shared/auth-context.js";
import { putItem } from "../../shared/dynamodb.js";
import { ENV } from "../../shared/constants.js";
import { parseJsonBody, validateBody } from "../../shared/validator.js";
import { createDeviceEndpoint } from "../../shared/sns.js";
import { hashToken } from "../../shared/notifications-service.js";
import { messageResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const { userId } = getAuthenticatedUser(event);
  const body = validateBody(parseJsonBody(event), {
    platform: { required: true, type: "string", enum: ["android", "ios"] },
    deviceToken: { required: true, type: "string" }
  });

  const tokenHash = hashToken(body.deviceToken);
  const now = new Date().toISOString();
  const snsEndpointArn = await createDeviceEndpoint(body.deviceToken);
  await putItem(ENV.DEVICES_TABLE, {
    PK: `USER#${userId}`,
    SK: `DEVICE#${body.platform}#${tokenHash}`,
    platform: body.platform,
    tokenHash,
    snsEndpointArn,
    enabled: true,
    createdAt: now,
    updatedAt: now
  });

  return messageResponse("Dispositivo registrado correctamente.");
});
