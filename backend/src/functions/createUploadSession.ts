import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';

import { getDynamoDbDocumentClient, getS3Client } from '../lib/aws';
import { ASSIGNMENTS_BUCKET, ASSIGNMENTS_TABLE, COURSES_TABLE } from '../lib/env';

type CreateUploadSessionBody = {
  studentId?: string;
  studentName?: string;
  courseId?: string;
  files?: Array<{
    fileName?: string;
    contentType?: string;
    size?: number;
  }>;
  comment?: string;
  studentEmail?: string;
  educatorEmails?: string[];
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Missing request body' }) };
  }

  let payload: CreateUploadSessionBody;
  try {
    payload = JSON.parse(event.body);
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON payload' }) };
  }

  const { studentId, studentName, courseId, files, comment, studentEmail, educatorEmails } = payload;

  if (!courseId || !files || files.length === 0) {
    return {
      statusCode: 422,
      body: JSON.stringify({ message: 'courseId and at least one file are required' })
    };
  }

  if (!studentId && !studentEmail && !studentName) {
    return {
      statusCode: 422,
      body: JSON.stringify({ message: 'Provide at least one of studentId, studentEmail, or studentName' })
    };
  }

  const sanitizedFiles = files.map((file, index) => ({
    fileName: file.fileName ?? `upload-${index}`,
    contentType: file.contentType ?? 'application/octet-stream',
    size: file.size ?? null
  }));

  const submissionId = uuid();
  const dynamodb = getDynamoDbDocumentClient();
  let courseNameSnapshot: string | null = null;
  let courseEducatorName: string | null = null;
  let courseEducatorEmail: string | null = null;

  try {
    const courseResult = await dynamodb.send(
      new GetCommand({
        TableName: COURSES_TABLE,
        Key: { courseCode: courseId }
      })
    );

    if (courseResult.Item) {
      courseNameSnapshot =
        typeof courseResult.Item.courseName === 'string' && courseResult.Item.courseName.trim()
          ? courseResult.Item.courseName.trim()
          : null;
      courseEducatorName =
        typeof courseResult.Item.educatorName === 'string' && courseResult.Item.educatorName.trim()
          ? courseResult.Item.educatorName.trim()
          : null;
      courseEducatorEmail =
        typeof courseResult.Item.educatorEmail === 'string' && courseResult.Item.educatorEmail.trim()
          ? courseResult.Item.educatorEmail.trim().toLowerCase()
          : null;
    }
  } catch (error) {
    console.error('Failed to resolve course details for submission', { error, courseId, submissionId });
  }

  const normalizedEducatorEmails = Array.isArray(educatorEmails)
    ? educatorEmails
        .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
        .filter((value) => value.length > 0)
    : [];

  if (normalizedEducatorEmails.length === 0 && courseEducatorEmail) {
    normalizedEducatorEmails.push(courseEducatorEmail);
  }

  const uniqueEducatorEmails = Array.from(new Set(normalizedEducatorEmails));

  const studentSegment = studentId ?? studentEmail ?? studentName ?? 'unknown-student';
  const normalizedStudentSegment = encodeURIComponent(studentSegment);
  const baseKey = `${courseId}/${normalizedStudentSegment}/${submissionId}`;
  const timestamp = new Date().toISOString();
  const downloadExpiryDate = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString();
  const s3 = getS3Client();

  const headers = event.headers ?? {};
  const protocol = (headers['x-forwarded-proto'] ?? headers['X-Forwarded-Proto'] ?? 'https') as string;
  const stagePath =
    event.requestContext.stage && event.requestContext.stage !== '$default'
      ? `/${event.requestContext.stage}`
      : '';
  const domainName = event.requestContext.domainName;
  const downloadBaseUrl = `${protocol}://${domainName}${stagePath}`;

  const uploadTargets = await Promise.all(
    sanitizedFiles.map(async (file) => {
      const downloadToken = uuid();
      const segments = (file.fileName ?? 'upload')
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      const objectKey = `${baseKey}/${segments}`;
      const command = new PutObjectCommand({
        Bucket: ASSIGNMENTS_BUCKET,
        Key: objectKey,
        ContentType: file.contentType ?? 'application/octet-stream'
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 60 });

      return {
        uploadUrl,
        record: {
          fileName: file.fileName ?? null,
          contentType: file.contentType ?? null,
          size: file.size ?? null,
          objectKey,
          downloadToken,
          expiresAt: downloadExpiryDate
        }
      };
    })
  );

  const filesForStorage = uploadTargets.map(({ record }) => record);

  await dynamodb.send(
    new PutCommand({
      TableName: ASSIGNMENTS_TABLE,
      Item: {
        submissionId,
        studentId,
        studentName: studentName ?? null,
        courseId,
        createdAt: timestamp,
        updatedAt: timestamp,
        comment: comment ?? null,
        status: 'PENDING',
        files: filesForStorage,
        studentEmail: studentEmail ?? null,
        educatorEmails: uniqueEducatorEmails,
        downloadBaseUrl,
        courseName: courseNameSnapshot,
        courseEducatorName,
        courseEducatorEmail,
        reminderCount: 0
      }
    })
  );

  return {
    statusCode: 201,
    body: JSON.stringify({
      submissionId,
      expiresInSeconds: 60 * 60 * 24 * 28,
      files: uploadTargets.map(({ uploadUrl, record }) => ({
        fileName: record.fileName,
        contentType: record.contentType,
        size: record.size,
        objectKey: record.objectKey,
        downloadToken: record.downloadToken,
        expiresAt: record.expiresAt,
        uploadUrl
      }))
    })
  };
};
