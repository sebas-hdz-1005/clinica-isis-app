import { getItem } from "../../shared/dynamodb.js";
import { ENV } from "../../shared/constants.js";

const toClaimValue = (value) => String(value ?? "");

export const handler = async (event) => {
  const sub = event?.request?.userAttributes?.sub;

  let appointmentCost = ENV.DEFAULT_APPOINTMENT_COST;
  let appointmentCurrency = ENV.DEFAULT_APPOINTMENT_CURRENCY;
  let tokenAppointmentCost = appointmentCost;
  let isReviewUser = false;

  if (sub) {
    const profile = await getItem(ENV.USERS_TABLE, { PK: `USER#${sub}`, SK: "PROFILE" });

    if (profile) {
      appointmentCost = Number(profile.appointmentCost ?? ENV.DEFAULT_APPOINTMENT_COST);
      appointmentCurrency = profile.appointmentCurrency || ENV.DEFAULT_APPOINTMENT_CURRENCY;
      tokenAppointmentCost = Number(
        profile.tokenAppointmentCost ?? profile.appointmentCost ?? ENV.DEFAULT_APPOINTMENT_COST
      );
      isReviewUser = Boolean(profile.isReviewUser);
    }
  }

  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: {
        appointment_cost: toClaimValue(tokenAppointmentCost),
        appointment_currency: toClaimValue(appointmentCurrency),
        review_user: toClaimValue(isReviewUser)
      }
    }
  };

  return event;
};
