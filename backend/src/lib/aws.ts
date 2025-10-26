import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SESClient } from '@aws-sdk/client-ses';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'eu-south-1';

let dynamoDbDocumentClient: DynamoDBDocumentClient | undefined;
let s3Client: S3Client | undefined;
let sesClient: SESClient | undefined;
let secretsClient: SecretsManagerClient | undefined;

export const getDynamoDbDocumentClient = (): DynamoDBDocumentClient => {
  if (!dynamoDbDocumentClient) {
    const dynamoDbClient = new DynamoDBClient({ region });
    dynamoDbDocumentClient = DynamoDBDocumentClient.from(dynamoDbClient, {
      marshallOptions: { removeUndefinedValues: true }
    });
  }
  return dynamoDbDocumentClient;
};

export const getS3Client = (): S3Client => {
  if (!s3Client) {
    s3Client = new S3Client({ region });
  }
  return s3Client;
};

export const getSesClient = (): SESClient => {
  if (!sesClient) {
    sesClient = new SESClient({ region });
  }
  return sesClient;
};

export const getSecretsManagerClient = (): SecretsManagerClient => {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({ region });
  }
  return secretsClient;
};
