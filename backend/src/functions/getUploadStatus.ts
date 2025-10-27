import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

import { getDynamoDbDocumentClient } from '../lib/aws';
import { ASSIGNMENTS_TABLE } from '../lib/env';

type SubmissionFile = {
  fileName?: string | null;
  contentType?: string | null;
  size?: number | null;
  objectKey: string;
  downloadToken: string;
  expiresAt: string;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const submissionId = event.pathParameters?.submissionId;

  if (!submissionId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'submissionId is required' })
    };
  }

  const dynamodb = getDynamoDbDocumentClient();
  const result = await dynamodb.send(
    new GetCommand({
      TableName: ASSIGNMENTS_TABLE,
      Key: { submissionId }
    })
  );

  if (!result.Item) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'Submission not found' })
    };
  }

  const item = result.Item;
  const files = (item.files as SubmissionFile[]) ?? [];
  const downloadBaseUrl = (item.downloadBaseUrl as string | undefined) ?? '';

  const responseFiles = files.map((file) => ({
    fileName: file.fileName,
    contentType: file.contentType,
    size: file.size,
    objectKey: file.objectKey,
    downloadToken: file.downloadToken,
    expiresAt: file.expiresAt,
    downloadUrl: downloadBaseUrl
      ? `${downloadBaseUrl}/downloads/${submissionId}/${file.downloadToken}`
      : null
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({
      submissionId,
      status: item.status,
      createdAt: item.createdAt,
      archiveRequestedAt: item.archiveRequestedAt ?? null,
      completedAt: item.completedAt ?? null,
      lastError: item.lastError ?? null,
      files: responseFiles
    })
  };
};
