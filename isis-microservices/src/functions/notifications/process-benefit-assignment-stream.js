import { sendBenefitAlert } from "../../shared/notifications-service.js";
import { logger } from "../../shared/logger.js";

const attr = (value) => {
  if (!value) return undefined;
  if ("S" in value) return value.S;
  if ("BOOL" in value) return value.BOOL;
  return undefined;
};

export const handler = async (event) => {
  for (const record of event.Records || []) {
    if (record.eventName !== "INSERT") continue;
    const image = record.dynamodb?.NewImage || {};
    const pk = attr(image.PK);
    const sk = attr(image.SK);
    const notified = attr(image.notified);
    if (!pk?.startsWith("USER#") || !sk?.startsWith("BENEFIT#") || notified === true) continue;

    const userId = pk.replace("USER#", "");
    const benefitId = sk.replace("BENEFIT#", "");
    try {
      await sendBenefitAlert({ userId, benefitId });
    } catch (error) {
      logger.error("Benefit assignment stream failed", { errorName: error.name, benefitId });
      throw error;
    }
  }
  return { batchItemFailures: [] };
};
