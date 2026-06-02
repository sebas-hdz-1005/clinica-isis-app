import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const TEMPORARY_PASSWORD = "Test321*";
const DEFAULT_REGION = "us-east-2";
const PROFILE_SK = "PROFILE";

const usage = () => {
  console.error("Uso: node scripts/import-users-from-csv.js ./usuarios.csv");
  console.error("");
  console.error("Variables requeridas:");
  console.error("  COGNITO_USER_POOL_ID=<user-pool-id>");
  console.error("  USERS_TABLE=<tabla-dynamodb>");
  console.error("");
  console.error("Variables opcionales:");
  console.error("  AWS_REGION=us-east-2");
  console.error("  AWS_PROFILE=<perfil-aws>");
};

const env = {
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || DEFAULT_REGION,
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  usersTable: process.env.USERS_TABLE
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

const parseCsv = (content) => {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }

  return rows;
};

const getCell = (row, index) => (row[index] || "").trim();

const readCedulasFromCsv = async (filePath) => {
  const content = await readFile(filePath, "utf8");
  const rows = parseCsv(content.replace(/^\uFEFF/, ""));
  if (rows.length === 0) throw new Error("El CSV esta vacio.");

  const headers = rows[0].map((header) => header.trim());
  const cedulaIndex = headers.indexOf("numero_identificacion");
  if (cedulaIndex === -1) {
    throw new Error("El CSV debe tener una columna llamada numero_identificacion.");
  }

  return rows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    cedula: getCell(row, cedulaIndex)
  }));
};

const getCognitoAttribute = (user, attributeName) =>
  user.UserAttributes?.find((attribute) => attribute.Name === attributeName)?.Value;

const findCognitoUser = async (client, cedula) => {
  try {
    return await client.send(new AdminGetUserCommand({
      UserPoolId: env.userPoolId,
      Username: cedula
    }));
  } catch (error) {
    if (error?.name === "UserNotFoundException") return null;
    throw error;
  }
};

const createCognitoUser = async (client, cedula) => {
  await client.send(new AdminCreateUserCommand({
    UserPoolId: env.userPoolId,
    Username: cedula,
    TemporaryPassword: TEMPORARY_PASSWORD,
    MessageAction: "SUPPRESS"
  }));

  await client.send(new AdminSetUserPasswordCommand({
    UserPoolId: env.userPoolId,
    Username: cedula,
    Password: TEMPORARY_PASSWORD,
    Permanent: true
  }));

  return findCognitoUser(client, cedula);
};

const putUserProfile = async (documentClient, { sub, cedula }) => {
  const now = new Date().toISOString();
  await documentClient.send(new PutCommand({
    TableName: env.usersTable,
    Item: {
      PK: `USER#${sub}`,
      SK: PROFILE_SK,
      cedula,
      documentType: "CC",
      name: `Usuario ${cedula}`,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now
    },
    ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
  }));
};

const formatError = (error) => `${error?.name || "Error"}: ${error?.message || error}`;

const importUsers = async (filePath) => {
  requireEnv();

  const absolutePath = resolve(filePath);
  const rows = await readCedulasFromCsv(absolutePath);
  const cognito = new CognitoIdentityProviderClient({ region: env.region });
  const dynamo = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: env.region }),
    { marshallOptions: { removeUndefinedValues: true } }
  );

  const summary = {
    file: basename(absolutePath),
    processed: rows.length,
    created: 0,
    skipped: 0,
    failed: 0
  };
  const seen = new Set();
  const failures = [];

  for (const row of rows) {
    if (!row.cedula) {
      summary.skipped += 1;
      console.warn(`Fila ${row.rowNumber}: omitida porque numero_identificacion esta vacio.`);
      continue;
    }

    if (seen.has(row.cedula)) {
      summary.skipped += 1;
        console.warn(`Fila ${row.rowNumber}: omitida porque la cedula ${row.cedula} esta duplicada en el CSV.`);
      continue;
    }
    seen.add(row.cedula);

    try {
      const existingUser = await findCognitoUser(cognito, row.cedula);
      const user = existingUser || await createCognitoUser(cognito, row.cedula);
      const sub = getCognitoAttribute(user, "sub");
      if (!sub) throw new Error("Cognito no retorno el atributo sub del usuario creado.");

      await putUserProfile(dynamo, { sub, cedula: row.cedula });
      summary.created += 1;
      console.log(`Fila ${row.rowNumber}: usuario ${existingUser ? "sincronizado" : "creado"} para cedula ${row.cedula}.`);
    } catch (error) {
      if (error?.name === "ConditionalCheckFailedException") {
        summary.skipped += 1;
        console.warn(`Fila ${row.rowNumber}: omitida porque el perfil de la cedula ${row.cedula} ya existe en DynamoDB.`);
        continue;
      }
      summary.failed += 1;
      failures.push({ rowNumber: row.rowNumber, cedula: row.cedula, error: formatError(error) });
      console.error(`Fila ${row.rowNumber}: fallo la cedula ${row.cedula}. ${formatError(error)}`);
    }
  }

  console.log("");
  console.log("Resumen de importacion");
  console.log(`Archivo: ${summary.file}`);
  console.log(`Procesados: ${summary.processed}`);
  console.log(`Creados: ${summary.created}`);
  console.log(`Omitidos: ${summary.skipped}`);
  console.log(`Fallidos: ${summary.failed}`);

  if (failures.length > 0) {
    console.log("");
    console.log("Fallidos:");
    for (const failure of failures) {
      console.log(`- Fila ${failure.rowNumber} (${failure.cedula}): ${failure.error}`);
    }
    process.exitCode = 1;
  }
};

const [, , csvPath] = process.argv;

if (!csvPath) {
  usage();
  process.exitCode = 1;
} else {
  importUsers(csvPath).catch((error) => {
    console.error(formatError(error));
    process.exitCode = 1;
  });
}
