import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const DEFAULT_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const DEFAULT_PASSWORD = process.env.TEST_USER_PASSWORD || "Review321*";
const DEFAULT_APPOINTMENT_COST = 2000;
const DEFAULT_TOKEN_APPOINTMENT_COST = 0;
const DEFAULT_APPOINTMENT_CURRENCY = "COP";

const env = {
  region: DEFAULT_REGION,
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  usersTable: process.env.USERS_TABLE
};

const usage = () => {
  console.error("Uso: node scripts/create-review-test-user.js");
  console.error("Variables requeridas:");
  console.error("  COGNITO_USER_POOL_ID=<user-pool-id>");
  console.error("  USERS_TABLE=<tabla-dynamodb>");
  console.error("Variables opcionales:");
  console.error("  TEST_USER_CEDULA=900000001");
  console.error("  TEST_USER_PASSWORD=Review321*");
};

const requireEnv = () => {
  const missing = [];
  if (!env.userPoolId) missing.push("COGNITO_USER_POOL_ID");
  if (!env.usersTable) missing.push("USERS_TABLE");
  if (missing.length > 0) {
    usage();
    throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
  }
};

const getCognitoAttribute = (user, attributeName) =>
  user.UserAttributes?.find((attribute) => attribute.Name === attributeName)?.Value;

const findCognitoUser = async (client, username) => {
  try {
    return await client.send(
      new AdminGetUserCommand({
        UserPoolId: env.userPoolId,
        Username: username
      })
    );
  } catch (error) {
    if (error?.name === "UserNotFoundException") return null;
    throw error;
  }
};

const createCognitoUser = async (client, username, email) => {
  await client.send(
    new AdminCreateUserCommand({
      UserPoolId: env.userPoolId,
      Username: username,
      TemporaryPassword: DEFAULT_PASSWORD,
      MessageAction: "SUPPRESS",
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" }
      ]
    })
  );

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: env.userPoolId,
      Username: username,
      Password: DEFAULT_PASSWORD,
      Permanent: true
    })
  );

  return findCognitoUser(client, username);
};

const putUserProfile = async (documentClient, profile) => {
  await documentClient.send(
    new PutCommand({
      TableName: env.usersTable,
      Item: profile
    })
  );
};

const main = async () => {
  requireEnv();

  const cedula = process.env.TEST_USER_CEDULA || "900000001";
  const email = process.env.TEST_USER_EMAIL || "review-user@clinicaisis.test";
  const name = process.env.TEST_USER_NAME || "App Review Clinica ISIS";
  const phone = process.env.TEST_USER_PHONE || "+573009990001";

  const cognito = new CognitoIdentityProviderClient({ region: env.region });
  const dynamo = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: env.region }),
    { marshallOptions: { removeUndefinedValues: true } }
  );

  const existingUser = await findCognitoUser(cognito, cedula);
  const user = existingUser || (await createCognitoUser(cognito, cedula, email));
  const sub = getCognitoAttribute(user, "sub");

  if (!sub) {
    throw new Error("No fue posible obtener el sub del usuario de prueba.");
  }

  const now = new Date().toISOString();

  await putUserProfile(dynamo, {
    PK: `USER#${sub}`,
    SK: "PROFILE",
    cedula,
    documentType: "CC",
    name,
    email,
    phone,
    status: "ACTIVE",
    appointmentCost: DEFAULT_APPOINTMENT_COST,
    appointmentCurrency: DEFAULT_APPOINTMENT_CURRENCY,
    tokenAppointmentCost: DEFAULT_TOKEN_APPOINTMENT_COST,
    isReviewUser: true,
    createdAt: now,
    updatedAt: now
  });

  console.log(
    JSON.stringify(
      {
        created: !existingUser,
        region: env.region,
        userPoolId: env.userPoolId,
        usersTable: env.usersTable,
        credentials: {
          cedula,
          password: DEFAULT_PASSWORD
        },
        profile: {
          appointmentCost: DEFAULT_APPOINTMENT_COST,
          appointmentCurrency: DEFAULT_APPOINTMENT_CURRENCY,
          tokenAppointmentCost: DEFAULT_TOKEN_APPOINTMENT_COST,
          isReviewUser: true
        }
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
