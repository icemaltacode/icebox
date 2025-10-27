import { SQSHandler } from 'aws-lambda';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { SendEmailCommand } from '@aws-sdk/client-ses';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';

import { getDynamoDbDocumentClient, getS3Client, getSesClient } from '../lib/aws';
import { createZipArchive } from '../lib/archive';
import { buildEducatorEmail, buildStudentEmail } from '../lib/emailTemplates';
import { ASSIGNMENTS_BUCKET, ASSIGNMENTS_TABLE, COURSES_TABLE, SES_SOURCE_EMAIL } from '../lib/env';

type QueueMessage = {
  submissionId?: string;
  requestedAt?: string;
  downloadBaseUrl?: string;
};

type SubmissionFile = {
  fileName?: string | null;
  contentType?: string | null;
  size?: number | null;
  objectKey: string;
  downloadToken?: string;
  expiresAt?: string;
};

type SubmissionRecord = {
  submissionId: string;
  status?: string;
  courseId?: string;
  comment?: string | null;
  studentEmail?: string | null;
  studentName?: string | null;
  studentId?: string | null;
  educatorEmails?: string[] | null;
  files?: SubmissionFile[];
  downloadBaseUrl?: string | null;
};

const DEFAULT_EXPIRY_MS = 28 * 24 * 60 * 60 * 1000;

export const handler: SQSHandler = async (event) => {
  const dynamodb = getDynamoDbDocumentClient();
  const s3 = getS3Client();
  const ses = SES_SOURCE_EMAIL ? getSesClient() : undefined;

  for (const record of event.Records) {
    const messageContext: Record<string, unknown> = {
      messageId: record.messageId
    };

    try {
      const body = (record.body ? JSON.parse(record.body) : {}) as QueueMessage;
      const submissionId = body.submissionId;

      if (!submissionId) {
        console.warn('Archive queue message missing submissionId', messageContext);
        continue;
      }

      messageContext.submissionId = submissionId;

      const submissionResult = await dynamodb.send(
        new GetCommand({
          TableName: ASSIGNMENTS_TABLE,
          Key: { submissionId }
        })
      );

      if (!submissionResult.Item) {
        console.warn('Submission not found when processing archive job', messageContext);
        continue;
      }

      const submission = submissionResult.Item as SubmissionRecord;
      if (submission.status === 'COMPLETED') {
        console.info('Submission already completed, skipping archive processing', messageContext);
        continue;
      }

      const storedFiles = Array.isArray(submission.files) ? submission.files : [];
      if (storedFiles.length === 0) {
        console.warn('Submission has no files for archiving', messageContext);
        await markArchiveFailure(dynamodb, submissionId, 'No files available for archiving');
        continue;
      }

      const defaultExpiryDate = new Date(Date.now() + DEFAULT_EXPIRY_MS).toISOString();
      let filesNeedUpdate = false;

      const filesWithTokens = storedFiles.map((file) => {
        const downloadToken = file.downloadToken ?? uuid();
        const expiresAt = file.expiresAt ?? defaultExpiryDate;

        if (!file.downloadToken || !file.expiresAt) {
          filesNeedUpdate = true;
        }

        return {
          fileName: file.fileName ?? null,
          contentType: file.contentType ?? null,
          size: file.size ?? null,
          objectKey: file.objectKey,
          downloadToken,
          expiresAt
        };
      });

      let finalFiles = filesWithTokens;
      const shouldCreateArchive = filesWithTokens.length > 1;

      if (shouldCreateArchive) {
        const archiveKey = `archives/${submissionId}-${Date.now()}.zip`;
        const archiveToken = uuid();

        const archiveSize = await createZipArchive({
          s3,
          bucket: ASSIGNMENTS_BUCKET,
          submissionId,
          files: filesWithTokens.map((file) => ({
            fileName: file.fileName,
            contentType: file.contentType,
            size: file.size,
            objectKey: file.objectKey
          })),
          archiveKey
        });

        await s3.send(
          new DeleteObjectsCommand({
            Bucket: ASSIGNMENTS_BUCKET,
            Delete: {
              Objects: filesWithTokens.map((file) => ({ Key: file.objectKey }))
            }
          })
        );

        finalFiles = [
          {
            fileName: `${submissionId}.zip`,
            contentType: 'application/zip',
            size: archiveSize,
            objectKey: archiveKey,
            downloadToken: archiveToken,
            expiresAt: defaultExpiryDate
          }
        ];

        filesNeedUpdate = true;
      }

      const completedAt = new Date().toISOString();
      const expressionAttributeNames: Record<string, string> = {
        '#status': 'status',
        '#completedAt': 'completedAt',
        '#updatedAt': 'updatedAt',
        '#lastError': 'lastError'
      };
      const expressionAttributeValues: Record<string, unknown> = {
        ':status': 'COMPLETED',
        ':completedAt': completedAt,
        ':updatedAt': completedAt
      };
      const setExpressions = ['#status = :status', '#completedAt = :completedAt', '#updatedAt = :updatedAt'];

      if (filesNeedUpdate) {
        expressionAttributeNames['#files'] = 'files';
        expressionAttributeValues[':files'] = finalFiles.map((file) => ({
          fileName: file.fileName ?? null,
          contentType: file.contentType ?? null,
          size: file.size ?? null,
          objectKey: file.objectKey,
          downloadToken: file.downloadToken,
          expiresAt: file.expiresAt
        }));
        setExpressions.push('#files = :files');
      }

      await dynamodb.send(
        new UpdateCommand({
          TableName: ASSIGNMENTS_TABLE,
          Key: { submissionId },
          UpdateExpression: `SET ${setExpressions.join(', ')} REMOVE #lastError`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        })
      );

      const baseUrl = body.downloadBaseUrl ?? submission.downloadBaseUrl ?? undefined;

      const downloadResources =
        baseUrl && baseUrl.length > 0
          ? finalFiles.map((file) => ({
              fileName: file.fileName ?? file.objectKey,
              downloadUrl: `${baseUrl}/downloads/${submissionId}/${file.downloadToken}`,
              objectKey: file.objectKey,
              contentType: file.contentType,
              size: file.size,
              expiresAt: file.expiresAt
            }))
          : [];

      let courseDetails: { courseName?: string; educatorEmail?: string; educatorName?: string } = {};
      const courseId = submission.courseId ?? '';

      if (courseId) {
        try {
          const courseData = await dynamodb.send(
            new GetCommand({
              TableName: COURSES_TABLE,
              Key: { courseCode: courseId }
            })
          );

          if (courseData.Item) {
            courseDetails = {
              courseName: courseData.Item.courseName as string | undefined,
              educatorEmail: courseData.Item.educatorEmail as string | undefined,
              educatorName: courseData.Item.educatorName as string | undefined
            };
          }
        } catch (error) {
          console.error('Failed to fetch course details for archive notification', { error, submissionId, courseId });
        }
      }

      if (SES_SOURCE_EMAIL && ses && downloadResources.length > 0) {
        const filesForEmail = downloadResources.map((file) => ({
          label: file.fileName,
          href: file.downloadUrl
        }));

        const courseDisplayName = courseDetails.courseName
          ? `${courseDetails.courseName} (${courseId})`
          : courseId || 'Unknown course';
        const studentEmail = submission.studentEmail ?? undefined;
        const studentName = submission.studentName ?? undefined;
        const studentId = submission.studentId ?? undefined;
        const comment = submission.comment ?? undefined;
        const educatorEmails = Array.isArray(submission.educatorEmails) ? submission.educatorEmails.filter(Boolean) : [];
        const resolvedEducatorEmails =
          educatorEmails.length > 0
            ? educatorEmails
            : courseDetails.educatorEmail
              ? [courseDetails.educatorEmail]
              : [];

        if (studentEmail) {
          try {
            const studentEmailContent = buildStudentEmail({
              courseDisplayName,
              studentName,
              completedAtIso: completedAt,
              files: filesForEmail
            });

            await ses.send(
              new SendEmailCommand({
                Source: SES_SOURCE_EMAIL,
                Destination: { ToAddresses: [studentEmail] },
                Message: {
                  Subject: { Data: studentEmailContent.subject },
                  Body: {
                    Html: {
                      Charset: 'UTF-8',
                      Data: studentEmailContent.html
                    }
                  }
                }
              })
            );
          } catch (error) {
            console.error('Failed to send archive completion email to student', { error, submissionId, studentEmail });
          }
        }

        if (resolvedEducatorEmails.length > 0) {
          try {
            const educatorEmailContent = buildEducatorEmail({
              courseDisplayName,
              courseCode: courseId,
              educatorName: courseDetails.educatorName,
              studentName,
              studentId,
              studentEmail,
              completedAtIso: completedAt,
              files: filesForEmail,
              comment
            });

            const replyToAddress = studentEmail ?? 'no-reply@icecampus.com';

            await ses.send(
              new SendEmailCommand({
                Source: SES_SOURCE_EMAIL,
                Destination: { ToAddresses: resolvedEducatorEmails },
                ReplyToAddresses: [replyToAddress],
                Message: {
                  Subject: { Data: educatorEmailContent.subject },
                  Body: {
                    Html: {
                      Charset: 'UTF-8',
                      Data: educatorEmailContent.html
                    }
                  }
                }
              })
            );
          } catch (error) {
            console.error('Failed to send archive completion email to educator', {
              error,
              submissionId,
              resolvedEducatorEmails
            });
          }
        }
      } else if (!baseUrl) {
        console.warn('Skipping notification emails because download base URL is unavailable', messageContext);
      }
    } catch (error) {
      console.error('Archive processing failed', { error, ...messageContext });

      const submissionId = messageContext.submissionId as string | undefined;
      if (submissionId) {
        await markArchiveFailure(dynamodb, submissionId, 'Archive processing failed');
      }

      throw error;
    }
  }
};

const markArchiveFailure = async (
  dynamodb: ReturnType<typeof getDynamoDbDocumentClient>,
  submissionId: string,
  reason: string
) => {
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
          ':status': 'ARCHIVE_FAILED',
          ':lastError': reason,
          ':updatedAt': new Date().toISOString()
        }
      })
    );
  } catch (updateError) {
    console.error('Failed to update submission after archive failure', { updateError, submissionId });
  }
};
