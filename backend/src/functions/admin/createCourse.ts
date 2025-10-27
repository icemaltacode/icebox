import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

import { getDynamoDbDocumentClient } from '../../lib/aws';
import { resolveCoursePayload } from '../../lib/courses';
import { AdminAuthConfigurationError, requireAdminClaims, UnauthorizedError } from '../../lib/adminAuth';
import { ValidationError } from '../../lib/errors';
import { COURSES_TABLE } from '../../lib/env';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    await requireAdminClaims(event.headers);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' })
      };
    }
    if (error instanceof AdminAuthConfigurationError) {
      console.error('Admin authentication is not configured', { message: error.message });
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Admin authentication is not configured' })
      };
    }
    throw error;
  }

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Request body is required' })
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Request body must be valid JSON' })
    };
  }

  let courseInput: ReturnType<typeof resolveCoursePayload>;
  try {
    courseInput = resolveCoursePayload(payload, { requireCourseCode: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: error.message })
      };
    }
    throw error;
  }

  const now = new Date().toISOString();
  const item = {
    courseCode: courseInput.courseCode,
    courseName: courseInput.courseName,
    educatorName: courseInput.educatorName,
    educatorEmail: courseInput.educatorEmail,
    createdAt: now,
    updatedAt: now
  };

  const dynamodb = getDynamoDbDocumentClient();
  try {
    await dynamodb.send(
      new PutCommand({
        TableName: COURSES_TABLE,
        Item: item,
        ConditionExpression: 'attribute_not_exists(courseCode)'
      })
    );
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'A course with that code already exists' })
      };
    }
    console.error('Failed to create course assignment', { error });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to create course' })
    };
  }

  return {
    statusCode: 201,
    body: JSON.stringify(item)
  };
};
