import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { getDynamoDbDocumentClient, getS3Client } from '../lib/aws';
import { ASSIGNMENTS_BUCKET, ASSIGNMENTS_TABLE } from '../lib/env';

const DOWNLOAD_LINK_TTL_SECONDS = 900;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const submissionId = event.pathParameters?.submissionId;
  const token = event.pathParameters?.token;

  if (!submissionId || !token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'submissionId and token are required' })
    };
  }

  const dynamodb = getDynamoDbDocumentClient();
  const existing = await dynamodb.send(
    new GetCommand({
      TableName: ASSIGNMENTS_TABLE,
      Key: { submissionId }
    })
  );

  if (!existing.Item) {
    return { statusCode: 404, body: JSON.stringify({ message: 'Submission not found' }) };
  }

  const files = (existing.Item.files as Array<Record<string, unknown>>) ?? [];
  const matchedFile = files.find((file) => file.downloadToken === token);

  if (!matchedFile) {
    return { statusCode: 404, body: JSON.stringify({ message: 'File not found for token' }) };
  }

  const expiresAt = matchedFile.expiresAt as string | undefined;
  if (!expiresAt || Date.parse(expiresAt) < Date.now()) {
    return {
      statusCode: 410,
      body: JSON.stringify({ message: 'Download link has expired' })
    };
  }

  const objectKey = matchedFile.objectKey as string;
  const s3 = getS3Client();
  const command = new GetObjectCommand({
    Bucket: ASSIGNMENTS_BUCKET,
    Key: objectKey
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: DOWNLOAD_LINK_TTL_SECONDS });

  return {
    statusCode: 302,
    headers: {
      Location: presignedUrl
    }
  };
};
