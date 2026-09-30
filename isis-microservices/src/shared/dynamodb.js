import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { ENV } from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { logger } from "./logger.js";

const client = new DynamoDBClient({ region: ENV.AWS_REGION });
export const dynamo = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

const databaseError = (error) => {
  logger.error("DynamoDB request failed", {
    errorName: error?.name,
    errorMessage: error?.message,
    cancellationReasons: error?.CancellationReasons,
    cause: error?.cause
  });
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

export const deleteItem = async (params) => {
  try {
    await dynamo.send(new DeleteCommand(params));
  } catch (error) {
    databaseError(error);
  }
};

export const queryAll = async (params) => {
  try {
    const items = [];
    let ExclusiveStartKey;

    do {
      const result = await dynamo.send(new QueryCommand({ ...params, ExclusiveStartKey }));
      items.push(...(result.Items || []));
      ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    return items;
  } catch (error) {
    databaseError(error);
  }
};

export const scanAll = async (params) => {
  try {
    const items = [];
    let ExclusiveStartKey;

    do {
      const result = await dynamo.send(new ScanCommand({ ...params, ExclusiveStartKey }));
      items.push(...(result.Items || []));
      ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    return items;
  } catch (error) {
    databaseError(error);
  }
};

export const transactWrite = async (TransactItems) => {
  try {
    await dynamo.send(new TransactWriteCommand({ TransactItems }));
  } catch (error) {
    if (
      error?.name === "ConditionalCheckFailedException" ||
      error?.name === "TransactionCanceledException"
    ) {
      throw error;
    }
    databaseError(error);
  }
};

export const batchWriteAll = async (TableName, items) => {
  try {
    for (let index = 0; index < items.length; index += 25) {
      let requestItems = {
        [TableName]: items.slice(index, index + 25).map((Item) => ({
          PutRequest: { Item }
        }))
      };

      do {
        const result = await dynamo.send(new BatchWriteCommand({ RequestItems: requestItems }));
        requestItems = result.UnprocessedItems || {};
      } while (requestItems[TableName] && requestItems[TableName].length > 0);
    }
  } catch (error) {
    databaseError(error);
  }
};
