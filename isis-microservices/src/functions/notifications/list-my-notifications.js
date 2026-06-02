import { handle } from "../../shared/handler.js";
import { getAuthenticatedUser } from "../../shared/auth-context.js";
import { queryItems } from "../../shared/dynamodb.js";
import { ENV } from "../../shared/constants.js";
import { successResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const { userId } = getAuthenticatedUser(event);
  const result = await queryItems({
    TableName: ENV.NOTIFICATIONS_TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":prefix": "NOTIFICATION#"
    },
    ScanIndexForward: false
  });
  const items = (result.Items || []).map((item) => ({
    notificationId: item.notificationId,
    type: item.type,
    title: item.title,
    message: item.message,
    benefitId: item.benefitId,
    read: item.read,
    createdAt: item.createdAt
  }));
  return successResponse({
    unreadCount: items.filter((item) => !item.read).length,
    items
  });
});
