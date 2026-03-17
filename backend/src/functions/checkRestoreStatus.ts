import { ScheduledHandler } from 'aws-lambda';
import { ScanCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand } from '@aws-sdk/client-ses';

import { getDynamoDbDocumentClient, getSesClient } from '../lib/aws';
import { ASSIGNMENTS_TABLE, COURSES_TABLE, SES_SOURCE_EMAIL, ADMIN_PORTAL_URL } from '../lib/env';
import { getStorageInfo } from '../lib/glacier';
import { buildRestoreCompleteEmail } from '../lib/emailTemplates';

export const handler: ScheduledHandler = async () => {
  const dynamodb = getDynamoDbDocumentClient();
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const pendingSubmissions: Array<{
    submissionId: string;
    objectKey: string;
    restoreRequestedBy: string | null;
    courseId: string;
    studentName: string | null;
  }> = [];

  // Find all submissions with a pending restore
  do {
    const response = await dynamodb.send(
      new ScanCommand({
        TableName: ASSIGNMENTS_TABLE,
        FilterExpression: 'attribute_exists(#rra) AND attribute_not_exists(#rca)',
        ExpressionAttributeNames: {
          '#rra': 'restoreRequestedAt',
          '#rca': 'restoreCompletedAt'
        },
        ExclusiveStartKey: lastEvaluatedKey
      })
    );

    for (const item of response.Items ?? []) {
      const files = item.files as Array<Record<string, unknown>> | undefined;
      if (files && files.length > 0 && files[0].objectKey) {
        pendingSubmissions.push({
          submissionId: item.submissionId as string,
          objectKey: files[0].objectKey as string,
          restoreRequestedBy: (item.restoreRequestedBy as string) ?? null,
          courseId: (item.courseId as string) ?? '',
          studentName: (item.studentName as string) ?? null
        });
      }
    }

    lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  if (pendingSubmissions.length === 0) {
    return;
  }

  console.log(`Checking restore status for ${pendingSubmissions.length} submission(s)`);

  for (const pending of pendingSubmissions) {
    try {
      const storageInfo = await getStorageInfo(pending.objectKey);

      if (storageInfo.restoreStatus !== 'COMPLETED') {
        continue;
      }

      const now = new Date().toISOString();

      await dynamodb.send(
        new UpdateCommand({
          TableName: ASSIGNMENTS_TABLE,
          Key: { submissionId: pending.submissionId },
          UpdateExpression: 'SET #restoreCompletedAt = :now, #restoreExpiresAt = :expiresAt, #updatedAt = :now',
          ExpressionAttributeNames: {
            '#restoreCompletedAt': 'restoreCompletedAt',
            '#restoreExpiresAt': 'restoreExpiresAt',
            '#updatedAt': 'updatedAt'
          },
          ExpressionAttributeValues: {
            ':now': now,
            ':expiresAt': storageInfo.restoreExpiresAt ?? now
          }
        })
      );

      console.log(`Restore completed for submission ${pending.submissionId}`);

      // Send email notification to the admin who requested the restore
      if (pending.restoreRequestedBy && SES_SOURCE_EMAIL) {
        let courseDisplayName = pending.courseId;
        try {
          const courseData = await dynamodb.send(
            new GetCommand({
              TableName: COURSES_TABLE,
              Key: { courseCode: pending.courseId }
            })
          );
          if (courseData.Item?.courseName) {
            courseDisplayName = `${courseData.Item.courseName} (${pending.courseId})`;
          }
        } catch (error) {
          console.error('Failed to fetch course details for restore notification', { error });
        }

        try {
          const ses = getSesClient();
          const emailContent = buildRestoreCompleteEmail({
            courseDisplayName,
            studentName: pending.studentName ?? undefined,
            submissionId: pending.submissionId,
            restoreExpiresAtIso: storageInfo.restoreExpiresAt ?? now,
            portalUrl: ADMIN_PORTAL_URL
          });

          await ses.send(
            new SendEmailCommand({
              Source: SES_SOURCE_EMAIL,
              Destination: { ToAddresses: [pending.restoreRequestedBy] },
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
          console.error('Failed to send restore completion email', { error, submissionId: pending.submissionId });
        }
      }
    } catch (error) {
      console.error('Failed to check restore status for submission', { error, submissionId: pending.submissionId });
    }
  }
};
