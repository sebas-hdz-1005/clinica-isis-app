import { handle } from "../../shared/handler.js";
import { getAuthenticatedUser } from "../../shared/auth-context.js";
import { getItem, updateItem } from "../../shared/dynamodb.js";
import { ENV } from "../../shared/constants.js";
import { AppError, ERROR_CODES } from "../../shared/errors.js";
import { messageResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const { userId } = getAuthenticatedUser(event);
  const notificationId = event.pathParameters?.notificationId;
  if (!notificationId) throw new AppError(ERROR_CODES.VALIDATION_ERROR, "notificationId es requerido.", 400);

  const key = { PK: `USER#${userId}`, SK: `NOTIFICATION#${notificationId}` };
  const notification = await getItem(ENV.NOTIFICATIONS_TABLE, key);
  if (!notification) throw new AppError(ERROR_CODES.NOTIFICATION_NOT_FOUND, "Notificación no encontrada.", 404);

  await updateItem({
    TableName: ENV.NOTIFICATIONS_TABLE,
    Key: key,
    UpdateExpression: "SET #read = :read, readAt = :now",
    ExpressionAttributeNames: { "#read": "read" },
    ExpressionAttributeValues: {
      ":read": true,
      ":now": new Date().toISOString()
    }
  });
  return messageResponse("Notificación marcada como leída.");
});
