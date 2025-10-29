import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand } from '@aws-sdk/client-ses';

import { getDynamoDbDocumentClient, getSesClient } from '../../lib/aws';
import { ASSIGNMENTS_TABLE, SES_SOURCE_EMAIL } from '../../lib/env';
import { AdminAuthConfigurationError, AdminClaims, requireAdminClaims, UnauthorizedError } from '../../lib/adminAuth';
import { toSubmissionRecord } from '../../lib/submissions';
import { ValidationError } from '../../lib/errors';
import { buildEducatorEmail } from '../../lib/emailTemplates';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

  if (!SES_SOURCE_EMAIL) {
    console.error('SES source email is not configured; cannot send reminder');
    return { statusCode: 500, body: JSON.stringify({ message: 'Email configuration missing' }) };
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
    return { statusCode: 409, body: JSON.stringify({ message: 'No files available for reminder' }) };
  }

  const baseUrl = submission.downloadBaseUrl;
  if (!baseUrl) {
    return { statusCode: 409, body: JSON.stringify({ message: 'Download links are unavailable for this submission' }) };
  }

  const educatorEmails = submission.educatorEmails.length
    ? submission.educatorEmails
    : submission.courseEducatorEmail
      ? [submission.courseEducatorEmail]
      : [];

  if (!educatorEmails.length) {
    return { statusCode: 409, body: JSON.stringify({ message: 'No educator email addresses found for this submission' }) };
  }

  const filesForEmail = submission.files
    .filter((file) => file.downloadToken)
    .map((file) => ({
      label: file.fileName ?? file.objectKey,
      href: `${baseUrl}/downloads/${submissionId}/${file.downloadToken}`
    }));

  if (!filesForEmail.length) {
    return { statusCode: 409, body: JSON.stringify({ message: 'Download links are unavailable for this submission' }) };
  }

  const submissionTimestamp = Date.parse(submission.createdAt);
  const daysSinceSubmission = Number.isFinite(submissionTimestamp)
    ? Math.max(0, Math.floor((Date.now() - submissionTimestamp) / DAY_IN_MS))
    : 0;

  const courseDisplayName = submission.courseName
    ? `${submission.courseName} (${submission.courseId})`
    : submission.courseId;
  const completedAt = submission.completedAt ?? submission.createdAt;

  const emailContent = buildEducatorEmail({
    courseDisplayName,
    courseCode: submission.courseId,
    educatorName: submission.courseEducatorName ?? undefined,
    studentName: submission.studentName ?? undefined,
    studentId: submission.studentId ?? undefined,
    studentEmail: submission.studentEmail ?? undefined,
    completedAtIso: completedAt,
    files: filesForEmail,
    comment: submission.comment ?? undefined,
    mode: 'reminder',
    reminderDays: daysSinceSubmission
  });

  try {
    const ses = getSesClient();
    await ses.send(
      new SendEmailCommand({
        Source: SES_SOURCE_EMAIL,
        Destination: { ToAddresses: educatorEmails },
        Message: {
          Subject: { Data: emailContent.subject },
          Body: {
            Html: {
              Charset: 'UTF-8',
              Data: emailContent.html
            }
          }
        }
      })
    );
  } catch (error) {
    console.error('Failed to send educator reminder email', { error, submissionId, educatorEmails });
    return { statusCode: 502, body: JSON.stringify({ message: 'Failed to send reminder email' }) };
  }

  const now = new Date().toISOString();
  const actorEmail = resolveActorEmail(adminClaims);

  try {
    await dynamodb.send(
      new UpdateCommand({
        TableName: ASSIGNMENTS_TABLE,
        Key: { submissionId },
        UpdateExpression:
          'SET #lastReminderAt = :now, #updatedAt = :now, #reminderCount = if_not_exists(#reminderCount, :zero) + :one, #lastReminderBy = :actor',
        ExpressionAttributeNames: {
          '#lastReminderAt': 'lastReminderAt',
          '#updatedAt': 'updatedAt',
          '#reminderCount': 'reminderCount',
          '#lastReminderBy': 'lastReminderBy'
        },
        ExpressionAttributeValues: {
          ':now': now,
          ':zero': 0,
          ':one': 1,
          ':actor': actorEmail
        }
      })
    );
  } catch (error) {
    console.error('Failed to record reminder metadata', { error, submissionId });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Reminder sent' })
  };
};
