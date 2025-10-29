import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { getDynamoDbDocumentClient, getS3Client } from '../../lib/aws';
import { ASSIGNMENTS_BUCKET, ASSIGNMENTS_TABLE } from '../../lib/env';
import { AdminAuthConfigurationError, AdminClaims, requireAdminClaims, UnauthorizedError } from '../../lib/adminAuth';
import { toSubmissionRecord } from '../../lib/submissions';
import { ValidationError } from '../../lib/errors';

const resolveActorEmail = (claims: AdminClaims): string => {
  if (claims.email) {
    return claims.email;
  }
  if (claims['cognito:username']) {
    return claims['cognito:username'] as string;
  }
  return 'unknown-admin@icecampus.com';
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  let adminClaims: AdminClaims;
  try {
    adminClaims = await requireAdminClaims(event.headers);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }
    if (error instanceof AdminAuthConfigurationError) {
      console.error('Admin authentication not configured', { message: error.message });
      return { statusCode: 500, body: JSON.stringify({ message: 'Admin authentication not configured' }) };
    }
    throw error;
  }

  const submissionId = event.pathParameters?.submissionId;
  if (!submissionId) {
    return { statusCode: 400, body: JSON.stringify({ message: 'submissionId is required' }) };
  }

  const dynamodb = getDynamoDbDocumentClient();
  const getResult = await dynamodb.send(
    new GetCommand({
      TableName: ASSIGNMENTS_TABLE,
      Key: { submissionId }
    })
  );

  if (!getResult.Item) {
    return { statusCode: 404, body: JSON.stringify({ message: 'Submission not found' }) };
  }

  let submission;
  try {
    submission = toSubmissionRecord(getResult.Item as Record<string, unknown>);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('Malformed submission record', { message: error.message, submissionId });
      return { statusCode: 500, body: JSON.stringify({ message: 'Submission data is invalid' }) };
    }
    throw error;
  }

  if (submission.deletedAt) {
    return { statusCode: 204, body: JSON.stringify({ message: 'Submission already deleted' }) };
  }

  const s3 = getS3Client();
  const objectsToDelete = submission.files.map((file) => ({ Key: file.objectKey }));

  if (objectsToDelete.length > 0) {
    try {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: ASSIGNMENTS_BUCKET,
          Delete: { Objects: objectsToDelete }
        })
      );
    } catch (error) {
      console.error('Failed to delete submission files from S3', { error, submissionId });
      return { statusCode: 502, body: JSON.stringify({ message: 'Failed to delete submission files' }) };
    }
  }

  const now = new Date().toISOString();
  const actorEmail = resolveActorEmail(adminClaims);

  try {
    await dynamodb.send(
      new UpdateCommand({
        TableName: ASSIGNMENTS_TABLE,
        Key: { submissionId },
        UpdateExpression:
          'SET #status = :status, #deletedAt = :now, #deletedBy = :actor, #updatedAt = :now, #files = :empty REMOVE #lastError',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#deletedAt': 'deletedAt',
          '#deletedBy': 'deletedBy',
          '#updatedAt': 'updatedAt',
          '#files': 'files',
          '#lastError': 'lastError'
        },
        ExpressionAttributeValues: {
          ':status': 'DELETED',
          ':now': now,
          ':actor': actorEmail,
          ':empty': []
        }
      })
    );
  } catch (error) {
    console.error('Failed to update submission metadata after deletion', { error, submissionId });
    return { statusCode: 500, body: JSON.stringify({ message: 'Failed to update submission metadata' }) };
  }

  return { statusCode: 204, body: JSON.stringify({ message: 'Submission deleted' }) };
};
