import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand } from '@aws-sdk/client-ses';
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuid } from 'uuid';
import archiver from 'archiver';
import { PassThrough, Readable } from 'stream';

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

import { getDynamoDbDocumentClient, getSesClient, getS3Client } from '../lib/aws';
import { ASSIGNMENTS_BUCKET, ASSIGNMENTS_TABLE, COURSES_TABLE, SES_SOURCE_EMAIL } from '../lib/env';
import { buildEducatorEmail, buildStudentEmail } from '../lib/emailTemplates';

type CompleteUploadBody = {
  comment?: string;
  studentEmail?: string;
  studentName?: string;
  educatorEmails?: string[];
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const submissionId = event.pathParameters?.submissionId;
  if (!submissionId) {
    return { statusCode: 400, body: JSON.stringify({ message: 'submissionId is required' }) };
  }

  let payload: CompleteUploadBody = {};
  if (event.body) {
    try {
      payload = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON payload' }) };
    }
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

  const headers = event.headers ?? {};
  const protocol = (headers['x-forwarded-proto'] ?? headers['X-Forwarded-Proto'] ?? 'https') as string;
  const stagePath = event.requestContext.stage && event.requestContext.stage !== '$default' ? `/${event.requestContext.stage}` : '';
  const domainName = event.requestContext.domainName;
  const baseUrl = `${protocol}://${domainName}${stagePath}`;
  const buildDownloadUrl = (token: string) => `${baseUrl}/downloads/${submissionId}/${token}`;

  const completedAt = new Date().toISOString();
  const expressionAttributeNames: Record<string, string> = {
    '#status': 'status',
    '#completedAt': 'completedAt'
  };
  const expressionAttributeValues: Record<string, unknown> = {
    ':status': 'COMPLETED',
    ':completedAt': completedAt
  };
  const setExpressions = ['#status = :status', '#completedAt = :completedAt'];

  if (payload.comment) {
    expressionAttributeNames['#comment'] = 'comment';
    expressionAttributeValues[':comment'] = payload.comment;
    setExpressions.push('#comment = :comment');
  }
  if (payload.studentEmail) {
    expressionAttributeNames['#studentEmail'] = 'studentEmail';
    expressionAttributeValues[':studentEmail'] = payload.studentEmail;
    setExpressions.push('#studentEmail = :studentEmail');
  }
  if (payload.studentName) {
    expressionAttributeNames['#studentName'] = 'studentName';
    expressionAttributeValues[':studentName'] = payload.studentName;
    setExpressions.push('#studentName = :studentName');
  }
  if (payload.educatorEmails) {
    expressionAttributeNames['#educatorEmails'] = 'educatorEmails';
    expressionAttributeValues[':educatorEmails'] = payload.educatorEmails;
    setExpressions.push('#educatorEmails = :educatorEmails');
  }

  await dynamodb.send(
    new UpdateCommand({
      TableName: ASSIGNMENTS_TABLE,
      Key: { submissionId },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    })
  );

  const studentId = existing.Item.studentId as string | undefined;
  const courseId = existing.Item.courseId as string;
  const storedFiles = (existing.Item.files as Array<Record<string, unknown>>) ?? [];
  const studentEmail = payload.studentEmail ?? (existing.Item.studentEmail as string | undefined);
  const studentName = payload.studentName ?? (existing.Item.studentName as string | undefined);
  const educatorEmails = payload.educatorEmails ?? (existing.Item.educatorEmails as string[] | undefined) ?? [];
  const comment = payload.comment ?? (existing.Item.comment as string | undefined);

  const defaultExpiryDate = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString();
  let filesNeedUpdate = false;
  const filesWithTokens = storedFiles.map((file) => {
    const currentToken = (file.downloadToken as string | undefined) ?? uuid();
    const currentExpiry = (file.expiresAt as string | undefined) ?? defaultExpiryDate;
    if (!file.downloadToken || !file.expiresAt) {
      filesNeedUpdate = true;
    }
    return {
      fileName: file.fileName as string | undefined,
      contentType: file.contentType as string | undefined,
      size: file.size as number | undefined,
      objectKey: file.objectKey as string,
      downloadToken: currentToken,
      expiresAt: currentExpiry
    };
  });

  const s3 = getS3Client();
  let finalFiles = filesWithTokens;

const shouldCreateArchive = filesWithTokens.length > 1;

if (shouldCreateArchive) {
  const archiveKey = `archives/${submissionId}-${Date.now()}.zip`;
  const archiveToken = uuid();

    try {
      const passThrough = new PassThrough();
      const upload = new Upload({
        client: s3,
        params: {
          Bucket: ASSIGNMENTS_BUCKET,
          Key: archiveKey,
          Body: passThrough,
          ContentType: 'application/zip'
        }
      });

      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('error', (error: Error) => {
        throw error;
      });

      archive.pipe(passThrough);

      const hasRootFolders = filesWithTokens.some((file) => (file.fileName ?? file.objectKey).includes('/'));
      const prefix = hasRootFolders ? submissionId : undefined;

      for (const file of filesWithTokens) {
        const getObjectResult = await s3.send(
          new GetObjectCommand({
            Bucket: ASSIGNMENTS_BUCKET,
            Key: file.objectKey
          })
        );

        const originalName = file.fileName || file.objectKey;
        const entryName = prefix
          ? `${prefix}/${originalName}`
          : originalName;
        const body = getObjectResult.Body;

        if (!body) {
          throw new Error(`Empty object body for ${file.objectKey}`);
        }

        let buffer: Buffer;

        if (body instanceof Readable) {
          buffer = await streamToBuffer(body);
        } else if (typeof (body as unknown as ReadableStream).getReader === 'function') {
          const nodeStream = Readable.fromWeb(body as unknown as ReadableStream);
          buffer = await streamToBuffer(nodeStream);
        } else if (body instanceof Blob) {
          buffer = Buffer.from(await body.arrayBuffer());
        } else {
          throw new Error(`Unsupported object body type for ${file.objectKey}`);
        }

        archive.append(buffer, { name: entryName });
      }

      const uploadPromise = upload.done();
      await archive.finalize();
      await uploadPromise;

      const head = await s3.send(
        new HeadObjectCommand({ Bucket: ASSIGNMENTS_BUCKET, Key: archiveKey })
      );

      const archiveSize = head.ContentLength ?? filesWithTokens.reduce((total, file) => total + (file.size ?? 0), 0);

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

      await s3.send(
        new DeleteObjectsCommand({
          Bucket: ASSIGNMENTS_BUCKET,
          Delete: {
            Objects: filesWithTokens.map((file) => ({ Key: file.objectKey }))
          }
        })
      );

      filesNeedUpdate = true;
    } catch (error) {
      console.error('Failed to create archive for submission', { submissionId, error });
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Failed to process uploaded files' })
      };
    }
  }

  if (filesNeedUpdate) {
    await dynamodb.send(
      new UpdateCommand({
        TableName: ASSIGNMENTS_TABLE,
        Key: { submissionId },
        UpdateExpression: 'SET #files = :files',
        ExpressionAttributeNames: {
          '#files': 'files'
        },
        ExpressionAttributeValues: {
          ':files': finalFiles.map((file) => ({
            fileName: file.fileName ?? null,
            contentType: file.contentType ?? null,
            size: file.size ?? null,
            objectKey: file.objectKey,
            downloadToken: file.downloadToken,
            expiresAt: file.expiresAt
          }))
        }
      })
    );
  }

  let courseDetails: { courseName?: string; educatorEmail?: string; educatorName?: string } = {};
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
    console.error('Failed to fetch course details', { error, courseId });
  }

  const resolvedEducatorEmails = educatorEmails.length
    ? educatorEmails
    : courseDetails.educatorEmail
      ? [courseDetails.educatorEmail]
      : [];
  const courseDisplayName = courseDetails.courseName ? `${courseDetails.courseName} (${courseId})` : courseId;
  const downloadResources = finalFiles.map((file) => {
    const label = file.fileName ?? file.objectKey;
    return {
      fileName: label,
      objectKey: file.objectKey,
      contentType: file.contentType ?? null,
      size: file.size ?? null,
      expiresAt: file.expiresAt,
      downloadUrl: buildDownloadUrl(file.downloadToken)
    };
  });
  const filesForEmail = downloadResources.map((file) => ({
    label: file.fileName,
    href: file.downloadUrl
  }));

  if (SES_SOURCE_EMAIL) {
    const ses = getSesClient();

    const trySendEmail = async (command: SendEmailCommand, recipientType: string) => {
      try {
        await ses.send(command);
      } catch (error) {
        console.error(`Failed to send ${recipientType} notification`, {
          error,
          recipientType
        });
      }
    };

    if (studentEmail) {
      const studentEmailContent = buildStudentEmail({
        courseDisplayName,
        studentName,
        completedAtIso: completedAt,
        files: filesForEmail
      });

      await trySendEmail(
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
        }),
        'student'
      );
    }

    if (resolvedEducatorEmails.length > 0) {
      const replyToAddress = studentEmail ?? 'no-reply@icecampus.com';
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

      await trySendEmail(
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
        }),
        'educator'
      );
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      submissionId,
      status: 'COMPLETED',
      completedAt,
      files: downloadResources
    })
  };
};
