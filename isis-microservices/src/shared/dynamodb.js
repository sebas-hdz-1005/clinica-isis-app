import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { ENV } from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";

const client = new DynamoDBClient({ region: ENV.AWS_REGION });
export const dynamo = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

const databaseError = (error) => {
  if (error?.name === "ConditionalCheckFailedException") throw error;
  throw new AppError(ERROR_CODES.DATABASE_ERROR, "Error consultando la base de datos.", 500);
};

export const getItem = async (TableName, Key) => {
  try {
    const result = await dynamo.send(new GetCommand({ TableName, Key }));
    return result.Item;
  } catch (error) {
    databaseError(error);
  }
};

export const putItem = async (TableName, Item, options = {}) => {
  try {
    await dynamo.send(new PutCommand({ TableName, Item, ...options }));
    return Item;
  } catch (error) {
    databaseError(error);
  }
};

export const queryItems = async (params) => {
  try {
    const result = await dynamo.send(new QueryCommand(params));
    return result;
  } catch (error) {
    databaseError(error);
  }
};

export const updateItem = async (params) => {
  try {
    const result = await dynamo.send(new UpdateCommand(params));
    return result.Attributes;
  } catch (error) {
    databaseError(error);
  }
};
