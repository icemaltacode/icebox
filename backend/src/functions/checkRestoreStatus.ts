import { ScheduledHandler } from 'aws-lambda';
import { ScanCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand } from '@aws-sdk/client-ses';

import { getDynamoDbDocumentClient, getSesClient } from '../lib/aws';
import { ASSIGNMENTS_TABLE, COURSES_TABLE, SES_SOURCE_EMAIL, ADMIN_PORTAL_URL } from '../lib/env';
import { getStorageInfo } from '../lib/glacier';
import { buildRestoreBatchCompleteEmail } from '../lib/emailTemplates';

type CompletedRestore = {
  courseDisplayName: string;
  studentName: string | null;
  restoreExpiresAtIso: string;
};

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

  // Collect completed restores grouped by the admin who requested them
  const completedByAdmin = new Map<string, CompletedRestore[]>();
  const courseNameCache = new Map<string, string>();

  for (const pending of pendingSubmissions) {
    try {
      const storageInfo = await getStorageInfo(pending.objectKey);

      if (storageInfo.restoreStatus !== 'COMPLETED') {
        continue;
      }

      const now = new Date().toISOString();
      const restoreExpiresAtIso = storageInfo.restoreExpiresAt ?? now;

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
            ':expiresAt': restoreExpiresAtIso
          }
        })
      );

      console.log(`Restore completed for submission ${pending.submissionId}`);

      if (pending.restoreRequestedBy) {
        let courseDisplayName = pending.courseId;
        if (courseNameCache.has(pending.courseId)) {
          courseDisplayName = courseNameCache.get(pending.courseId)!;
        } else {
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
          courseNameCache.set(pending.courseId, courseDisplayName);
        }

        const items = completedByAdmin.get(pending.restoreRequestedBy) ?? [];
        items.push({
          courseDisplayName,
          studentName: pending.studentName,
          restoreExpiresAtIso
        });
        completedByAdmin.set(pending.restoreRequestedBy, items);
      }
    } catch (error) {
      console.error('Failed to check restore status for submission', { error, submissionId: pending.submissionId });
    }
  }

  // Send one batched email per admin
  if (SES_SOURCE_EMAIL) {
    const ses = getSesClient();
    for (const [adminEmail, items] of completedByAdmin) {
      try {
        const emailContent = buildRestoreBatchCompleteEmail({
          items,
          portalUrl: ADMIN_PORTAL_URL
        });

        await ses.send(
          new SendEmailCommand({
            Source: SES_SOURCE_EMAIL,
            Destination: { ToAddresses: [adminEmail] },
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
        console.error('Failed to send restore completion email', { error, adminEmail });
      }
    }
  }
};
