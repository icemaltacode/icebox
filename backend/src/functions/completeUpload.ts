import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SendMessageCommand } from '@aws-sdk/client-sqs';

import { getDynamoDbDocumentClient, getSqsClient } from '../lib/aws';
import { ASSIGNMENTS_TABLE, ARCHIVE_QUEUE_URL } from '../lib/env';

type CompleteUploadBody = {
  comment?: string;
  studentEmail?: string;
  studentName?: string;
  educatorEmails?: string[];
};

type SubmissionRecord = {
  submissionId: string;
  status?: string;
  files?: Array<Record<string, unknown>>;
  downloadBaseUrl?: string;
};

const parseJsonBody = (rawBody: string | undefined): CompleteUploadBody => {
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as CompleteUploadBody;
  } catch {
    throw new Error('Invalid JSON payload');
  }
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const submissionId = event.pathParameters?.submissionId;
  if (!submissionId) {
    return { statusCode: 400, body: JSON.stringify({ message: 'submissionId is required' }) };
  }

  let payload: CompleteUploadBody;
  try {
    payload = parseJsonBody(event.body);
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: (error as Error).message })
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

  const record = existing.Item as SubmissionRecord;

  if (!Array.isArray(record.files) || record.files.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'No files are associated with this submission.' })
    };
  }

  const nowIso = new Date().toISOString();

  const headers = event.headers ?? {};
  const protocol = (headers['x-forwarded-proto'] ?? headers['X-Forwarded-Proto'] ?? 'https') as string;
  const stagePath =
    event.requestContext.stage && event.requestContext.stage !== '$default'
      ? `/${event.requestContext.stage}`
      : '';
  const domainName = event.requestContext.domainName;
  const downloadBaseUrl = `${protocol}://${domainName}${stagePath}`;

  const expressionAttributeNames: Record<string, string> = {
    '#status': 'status',
    '#archiveRequestedAt': 'archiveRequestedAt',
    '#updatedAt': 'updatedAt',
    '#downloadBaseUrl': 'downloadBaseUrl'
  };
  const expressionAttributeValues: Record<string, unknown> = {
    ':status': 'PENDING_ARCHIVE',
    ':archiveRequestedAt': nowIso,
    ':updatedAt': nowIso,
    ':downloadBaseUrl': downloadBaseUrl
  };
  const setExpressions = [
    '#status = :status',
    '#archiveRequestedAt = :archiveRequestedAt',
    '#updatedAt = :updatedAt',
    '#downloadBaseUrl = :downloadBaseUrl'
  ];

  if (payload.comment) {
    expressionAttributeNames['#comment'] = 'comment';
    expressionAttributeValues[':comment'] = payload.comment;
    setExpressions.push('#comment = :comment');
  }
  if (payload.studentEmail) {
    expressionAttributeNames['#studentEmail'] = 'studentEmail';
    expressionAttributeValues[':studentEmail'] = payload.studentEmail.trim();
    setExpressions.push('#studentEmail = :studentEmail');
  }
  if (payload.studentName) {
    expressionAttributeNames['#studentName'] = 'studentName';
    expressionAttributeValues[':studentName'] = payload.studentName;
    setExpressions.push('#studentName = :studentName');
  }
  if (payload.educatorEmails) {
    expressionAttributeNames['#educatorEmails'] = 'educatorEmails';
    const normalizedEducatorEmails = payload.educatorEmails
      .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
      .filter((value) => value.length > 0);
    expressionAttributeValues[':educatorEmails'] = Array.from(new Set(normalizedEducatorEmails));
    setExpressions.push('#educatorEmails = :educatorEmails');
  }

  const updateResult = await dynamodb.send(
    new UpdateCommand({
      TableName: ASSIGNMENTS_TABLE,
      Key: { submissionId },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    })
  );

  const sqs = getSqsClient();
  try {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: ARCHIVE_QUEUE_URL,
        MessageBody: JSON.stringify({
          submissionId,
          requestedAt: nowIso,
          downloadBaseUrl
        })
      })
    );
  } catch (error) {
    console.error('Failed to enqueue archive job', { submissionId, error });
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: ASSIGNMENTS_TABLE,
          Key: { submissionId },
          UpdateExpression: 'SET #status = :status, #lastError = :lastError, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#lastError': 'lastError',
            '#updatedAt': 'updatedAt'
          },
          ExpressionAttributeValues: {
            ':status': 'ARCHIVE_QUEUE_FAILED',
            ':lastError': 'Failed to enqueue archive job',
            ':updatedAt': new Date().toISOString()
          }
        })
      );
    } catch (updateError) {
      console.error('Failed to record queue failure state', { submissionId, updateError });
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to queue archive job' })
    };
  }

  return {
    statusCode: 202,
    body: JSON.stringify({
      submissionId,
      status: 'PENDING_ARCHIVE',
      archiveRequestedAt: nowIso,
      attributes: updateResult.Attributes ?? {}
    })
  };
};
