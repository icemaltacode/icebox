import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { getDynamoDbDocumentClient } from '../../lib/aws';
import { ASSIGNMENTS_TABLE } from '../../lib/env';
import {
  AdminAuthConfigurationError,
  AdminClaims,
  requireAdminClaims,
  resolveActorEmail,
  UnauthorizedError
} from '../../lib/adminAuth';
import { toSubmissionRecord } from '../../lib/submissions';
import { ValidationError } from '../../lib/errors';

type UpdateBackupBody = {
  driveUploaded?: unknown;
  backupChecked?: unknown;
};

// Each tick is stored as an independent pair of timestamp + actor attributes.
const BACKUP_TICKS = [
  { key: 'driveUploaded', atAttribute: 'driveUploadedAt', byAttribute: 'driveUploadedBy' },
  { key: 'backupChecked', atAttribute: 'backupCheckedAt', byAttribute: 'backupCheckedBy' }
] as const;

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

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

  let payload: UpdateBackupBody;
  try {
    payload = event.body ? (JSON.parse(event.body) as UpdateBackupBody) : {};
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON payload' }) };
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Request body must be a JSON object' }) };
  }

  const changes = BACKUP_TICKS.filter((tick) => payload[tick.key] !== undefined);
  if (changes.length === 0) {
    return {
      statusCode: 422,
      body: JSON.stringify({ message: 'Provide driveUploaded and/or backupChecked' })
    };
  }

  if (changes.some((tick) => typeof payload[tick.key] !== 'boolean')) {
    return {
      statusCode: 422,
      body: JSON.stringify({ message: 'driveUploaded and backupChecked must be booleans' })
    };
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

  try {
    const submission = toSubmissionRecord(submissionResult.Item as Record<string, unknown>);
    if (submission.deletedAt) {
      return { statusCode: 410, body: JSON.stringify({ message: 'Submission has been deleted' }) };
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('Malformed submission record', { message: error.message, submissionId });
      return { statusCode: 500, body: JSON.stringify({ message: 'Submission data is invalid' }) };
    }
    throw error;
  }

  const now = new Date().toISOString();
  const expressionAttributeNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const expressionAttributeValues: Record<string, unknown> = { ':now': now };
  const setExpressions = ['#updatedAt = :now'];
  const removeExpressions: string[] = [];

  for (const tick of changes) {
    const atName = `#${tick.atAttribute}`;
    const byName = `#${tick.byAttribute}`;
    expressionAttributeNames[atName] = tick.atAttribute;
    expressionAttributeNames[byName] = tick.byAttribute;

    if (payload[tick.key] === true) {
      // Keep the original who/when if the tick is already set.
      expressionAttributeValues[':actor'] = resolveActorEmail(adminClaims);
      setExpressions.push(`${atName} = if_not_exists(${atName}, :now)`, `${byName} = if_not_exists(${byName}, :actor)`);
    } else {
      removeExpressions.push(atName, byName);
    }
  }

  const updateExpression = [
    `SET ${setExpressions.join(', ')}`,
    removeExpressions.length > 0 ? `REMOVE ${removeExpressions.join(', ')}` : ''
  ]
    .filter(Boolean)
    .join(' ');

  let attributes: Record<string, unknown>;
  try {
    const result = await dynamodb.send(
      new UpdateCommand({
        TableName: ASSIGNMENTS_TABLE,
        Key: { submissionId },
        UpdateExpression: updateExpression,
        ConditionExpression: 'attribute_exists(submissionId)',
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      })
    );
    attributes = (result.Attributes ?? {}) as Record<string, unknown>;
  } catch (error) {
    console.error('Failed to update submission backup status', { error, submissionId });
    return { statusCode: 500, body: JSON.stringify({ message: 'Failed to update backup status' }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      submissionId,
      driveUploadedAt: optionalString(attributes.driveUploadedAt),
      driveUploadedBy: optionalString(attributes.driveUploadedBy),
      backupCheckedAt: optionalString(attributes.backupCheckedAt),
      backupCheckedBy: optionalString(attributes.backupCheckedBy)
    })
  };
};
