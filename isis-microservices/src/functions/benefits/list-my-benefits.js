import { handle } from "../../shared/handler.js";
import { getAuthenticatedUser } from "../../shared/auth-context.js";
import { getItem, queryItems } from "../../shared/dynamodb.js";
import { ENV } from "../../shared/constants.js";
import { mapBenefit } from "../../shared/benefit-mapper.js";
import { successResponse } from "../../shared/response.js";

export const handler = handle(async (event) => {
  const { userId } = getAuthenticatedUser(event);
  const assignmentsResult = await queryItems({
    TableName: ENV.BENEFITS_TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":prefix": "BENEFIT#"
    }
  });

  const assignments = assignmentsResult.Items || [];
  const items = await Promise.all(assignments.map(async (assignment) => {
    const metadata = await getItem(ENV.BENEFITS_TABLE, {
      PK: `BENEFIT#${assignment.benefitId}`,
      SK: "METADATA"
    });
    return metadata ? mapBenefit(assignment, metadata) : null;
  }));

  return successResponse({ items: items.filter(Boolean) });
});
