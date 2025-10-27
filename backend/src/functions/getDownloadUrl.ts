import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SendEmailCommand } from '@aws-sdk/client-ses';

import { getDynamoDbDocumentClient, getS3Client, getSesClient } from '../lib/aws';
import { ASSIGNMENTS_BUCKET, ASSIGNMENTS_TABLE, COURSES_TABLE, SES_SOURCE_EMAIL } from '../lib/env';
import { buildWorkViewedEmail } from '../lib/emailTemplates';

const DOWNLOAD_LINK_TTL_SECONDS = 900;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const submissionId = event.pathParameters?.submissionId;
  const token = event.pathParameters?.token;

  if (!submissionId || !token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'submissionId and token are required' })
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

  const files = (existing.Item.files as Array<Record<string, unknown>>) ?? [];
  const matchedFile = files.find((file) => file.downloadToken === token);

  if (!matchedFile) {
    return { statusCode: 404, body: JSON.stringify({ message: 'File not found for token' }) };
  }

  const expiresAt = matchedFile.expiresAt as string | undefined;
  if (!expiresAt || Date.parse(expiresAt) < Date.now()) {
    return {
      statusCode: 410,
      body: JSON.stringify({ message: 'Download link has expired' })
    };
  }

  const objectKey = matchedFile.objectKey as string;
  const s3 = getS3Client();
  const command = new GetObjectCommand({
    Bucket: ASSIGNMENTS_BUCKET,
    Key: objectKey
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: DOWNLOAD_LINK_TTL_SECONDS });

  // Track first access and send notification to student
  const isFirstAccess = !existing.Item.firstAccessedAt;
  const studentEmail = existing.Item.studentEmail as string | undefined;
  const studentName = existing.Item.studentName as string | undefined;
  const courseId = existing.Item.courseId as string;

  if (isFirstAccess && studentEmail && SES_SOURCE_EMAIL) {
    const accessedAt = new Date().toISOString();

    // Update DynamoDB with first access timestamp
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: ASSIGNMENTS_TABLE,
          Key: { submissionId },
          UpdateExpression: 'SET #firstAccessedAt = :accessedAt',
          ExpressionAttributeNames: {
            '#firstAccessedAt': 'firstAccessedAt'
          },
          ExpressionAttributeValues: {
            ':accessedAt': accessedAt
          }
        })
      );
    } catch (error) {
      console.error('Failed to update firstAccessedAt', { error, submissionId });
    }

    // Fetch course details for the notification
    let courseDisplayName = courseId;
    let educatorName: string | undefined;

    try {
      const courseData = await dynamodb.send(
        new GetCommand({
          TableName: COURSES_TABLE,
          Key: { courseCode: courseId }
        })
      );

      if (courseData.Item) {
        const courseName = courseData.Item.courseName as string | undefined;
        courseDisplayName = courseName ? `${courseName} (${courseId})` : courseId;
        educatorName = courseData.Item.educatorName as string | undefined;
      }
    } catch (error) {
      console.error('Failed to fetch course details for notification', { error, courseId });
    }

    // Send notification email to student
    try {
      const ses = getSesClient();
      const emailContent = buildWorkViewedEmail({
        courseDisplayName,
        studentName,
        educatorName,
        accessedAtIso: accessedAt
      });

      await ses.send(
        new SendEmailCommand({
          Source: SES_SOURCE_EMAIL,
          Destination: { ToAddresses: [studentEmail] },
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
      console.error('Failed to send work viewed notification', { error, studentEmail, submissionId });
    }
  }

  return {
    statusCode: 302,
    headers: {
      Location: presignedUrl
    }
  };
};
