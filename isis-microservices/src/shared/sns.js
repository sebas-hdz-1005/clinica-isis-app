import { SNSClient, CreatePlatformEndpointCommand, PublishCommand } from "@aws-sdk/client-sns";
import { ENV } from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { logger } from "./logger.js";

const client = new SNSClient({ region: ENV.AWS_REGION });

export const createDeviceEndpoint = async (deviceToken) => {
  if (!ENV.SNS_PLATFORM_APPLICATION_ARN) return null;
  try {
    const result = await client.send(new CreatePlatformEndpointCommand({
      PlatformApplicationArn: ENV.SNS_PLATFORM_APPLICATION_ARN,
      Token: deviceToken
    }));
    return result.EndpointArn;
  } catch (error) {
    logger.error("SNS endpoint registration failed", { errorName: error.name });
    throw new AppError(ERROR_CODES.DEVICE_REGISTRATION_ERROR, "No se pudo registrar el dispositivo para push notifications.", 502);
  }
};

export const publishPush = async ({ endpointArn, title, message, data = {} }) => {
  if (!endpointArn) return;
  try {
    await client.send(new PublishCommand({
      TargetArn: endpointArn,
      MessageStructure: "json",
      Message: JSON.stringify({
        default: message,
        GCM: JSON.stringify({ notification: { title, body: message }, data }),
        APNS: JSON.stringify({ aps: { alert: { title, body: message }, sound: "default" }, data })
      })
    }));
  } catch (error) {
    logger.warn("Push notification failed", { errorName: error.name, endpointArn });
  }
};
