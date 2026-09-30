import { queryItems } from "./dynamodb.js";
import { ENV } from "./constants.js";

export const findUserProfileByCedula = async (cedula) => {
  const normalizedCedula = String(cedula || "").trim();
  if (!normalizedCedula) {
    return null;
  }

  const result = await queryItems({
    TableName: ENV.USERS_TABLE,
    IndexName: "CedulaIndex",
    KeyConditionExpression: "cedula = :cedula",
    ExpressionAttributeValues: {
      ":cedula": normalizedCedula
    }
  });

  return (result.Items || []).find((item) => item?.SK === "PROFILE") || null;
};
