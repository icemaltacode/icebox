import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

import { VLE_TOKENS_TABLE } from './env';

const dynamoDbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type TokenType = 'short' | 'long';

const nowSeconds = () => Math.floor(Date.now() / 1000);

export const generateToken = (): string => randomUUID().replace(/-/g, '');

export const storeToken = async (
  token: string,
  type: TokenType,
  ttlSeconds: number,
  attributes: Record<string, unknown> = {}
) => {
  const expires = nowSeconds() + ttlSeconds;
  await dynamoDbClient.send(
    new PutCommand({
      TableName: VLE_TOKENS_TABLE,
      Item: {
        token,
        type,
        ttl: expires,
        createdAt: nowSeconds(),
        ...attributes
      }
    })
  );
};

export const fetchToken = async (token: string) => {
  const result = await dynamoDbClient.send(
    new GetCommand({
      TableName: VLE_TOKENS_TABLE,
      Key: { token }
    })
  );
  return result.Item as
    | ({ token: string; type: TokenType; ttl: number; createdAt: number; parentToken?: string; used?: boolean })
    | undefined;
};

export const deleteToken = async (token: string) => {
  await dynamoDbClient.send(
    new DeleteCommand({
      TableName: VLE_TOKENS_TABLE,
      Key: { token }
    })
  );
};
