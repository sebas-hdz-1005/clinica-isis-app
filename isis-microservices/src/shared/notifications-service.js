import crypto from "crypto";
import { ENV, NOTIFICATION_TYPES } from "./constants.js";
import { getItem, putItem, queryItems, updateItem } from "./dynamodb.js";
import { publishPush } from "./sns.js";

export const createNotificationId = () => crypto.randomUUID();

export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

export const createBenefitNotification = async ({ userId, benefitId, title, message }) => {
  const now = new Date().toISOString();
  const notificationId = createNotificationId();
  const item = {
    PK: `USER#${userId}`,
    SK: `NOTIFICATION#${notificationId}`,
    notificationId,
    type: NOTIFICATION_TYPES.BENEFIT_ASSIGNED,
    title,
    message,
    benefitId,
    read: false,
    createdAt: now
  };
  await putItem(ENV.NOTIFICATIONS_TABLE, item);
  return item;
};

export const getActiveDevices = async (userId) => {
  const result = await queryItems({
    TableName: ENV.DEVICES_TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    FilterExpression: "enabled = :enabled",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":prefix": "DEVICE#",
      ":enabled": true
    }
  });
  return result.Items || [];
};

export const sendBenefitAlert = async ({ userId, benefitId }) => {
  const assignment = await getItem(ENV.BENEFITS_TABLE, {
    PK: `USER#${userId}`,
    SK: `BENEFIT#${benefitId}`
  });
  if (assignment?.notified === true) return { skipped: true };

  const metadata = await getItem(ENV.BENEFITS_TABLE, {
    PK: `BENEFIT#${benefitId}`,
    SK: "METADATA"
  });

  const title = "Nuevo beneficio disponible";
  const message = "Tienes un nuevo beneficio disponible en Clínica Isis.";
  await createBenefitNotification({ userId, benefitId, title, message });

  const devices = await getActiveDevices(userId);
  await Promise.all(devices.map((device) =>
    publishPush({
      endpointArn: device.snsEndpointArn,
      title,
      message,
      data: {
        type: NOTIFICATION_TYPES.BENEFIT_ASSIGNED,
        benefitId,
        benefitTitle: metadata?.title
      }
    })
  ));

  if (assignment) {
    await updateItem({
      TableName: ENV.BENEFITS_TABLE,
      Key: { PK: `USER#${userId}`, SK: `BENEFIT#${benefitId}` },
      UpdateExpression: "SET notified = :notified, notifiedAt = :now",
      ExpressionAttributeValues: {
        ":notified": true,
        ":now": new Date().toISOString()
      }
    });
  }

  return { skipped: false, devices: devices.length };
};
