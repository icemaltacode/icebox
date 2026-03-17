import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { getDynamoDbDocumentClient } from '../../lib/aws';
import { ASSIGNMENTS_TABLE } from '../../lib/env';
import { AdminAuthConfigurationError, AdminClaims, requireAdminClaims, UnauthorizedError } from '../../lib/adminAuth';
import { toSubmissionRecord } from '../../lib/submissions';
import { ValidationError } from '../../lib/errors';
import { getStorageInfo, initiateRestore, isGlacier } from '../../lib/glacier';

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
  const submissionResult = await dynamodb.send(
    new GetCommand({
      TableName: ASSIGNMENTS_TABLE,
      Key: { submissionId }
    })
  );

  if (!submissionResult.Item) {
    return { statusCode: 404, body: JSON.stringify({ message: 'Submission not found' }) };
  }

  let submission;
  try {
    submission = toSubmissionRecord(submissionResult.Item as Record<string, unknown>);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('Malformed submission record', { message: error.message, submissionId });
      return { statusCode: 500, body: JSON.stringify({ message: 'Submission data is invalid' }) };
    }
    throw error;
  }

  if (submission.deletedAt) {
    return { statusCode: 410, body: JSON.stringify({ message: 'Submission has been deleted' }) };
  }

  if (!submission.files.length) {
    return { statusCode: 409, body: JSON.stringify({ message: 'No files available for this submission' }) };
  }

  const objectKey = submission.files[0].objectKey;

  let storageInfo;
  try {
    storageInfo = await getStorageInfo(objectKey);
  } catch (error) {
    console.error('Failed to check storage class', { error, submissionId, objectKey });
    return { statusCode: 500, body: JSON.stringify({ message: 'Failed to check file storage status' }) };
  }

  if (!isGlacier(storageInfo.storageClass)) {
    return { statusCode: 409, body: JSON.stringify({ message: 'Object is not archived — download is available directly' }) };
  }

  if (storageInfo.restoreStatus === 'IN_PROGRESS') {
    return {
      statusCode: 409,
      body: JSON.stringify({ message: 'Restore is already in progress', restoreStatus: 'IN_PROGRESS' })
    };
  }

  if (storageInfo.restoreStatus === 'COMPLETED') {
    return {
      statusCode: 409,
      body: JSON.stringify({ message: 'Object is already restored', restoreStatus: 'COMPLETED', restoreExpiresAt: storageInfo.restoreExpiresAt })
    };
  }

  try {
    await initiateRestore(objectKey);
  } catch (error) {
    console.error('Failed to initiate Glacier restore', { error, submissionId, objectKey });
    return { statusCode: 500, body: JSON.stringify({ message: 'Failed to initiate restore' }) };
  }

  const now = new Date().toISOString();
  const actorEmail = resolveActorEmail(adminClaims);

  try {
    await dynamodb.send(
      new UpdateCommand({
        TableName: ASSIGNMENTS_TABLE,
        Key: { submissionId },
        UpdateExpression:
          'SET #restoreRequestedAt = :now, #restoreRequestedBy = :actor, #updatedAt = :now REMOVE #restoreCompletedAt, #restoreExpiresAt',
        ExpressionAttributeNames: {
          '#restoreRequestedAt': 'restoreRequestedAt',
          '#restoreRequestedBy': 'restoreRequestedBy',
          '#restoreCompletedAt': 'restoreCompletedAt',
          '#restoreExpiresAt': 'restoreExpiresAt',
          '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
          ':now': now,
          ':actor': actorEmail
        }
      })
    );
  } catch (error) {
    console.error('Failed to record restore request metadata', { error, submissionId });
  }

  return {
    statusCode: 202,
    body: JSON.stringify({
      message: 'Restore initiated — the file will be available in 3–5 hours',
      estimatedHours: '3-5'
    })
  };
};
