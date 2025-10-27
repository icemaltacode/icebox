import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { getDynamoDbDocumentClient } from '../../lib/aws';
import { resolveCoursePayload, toCourseRecord } from '../../lib/courses';
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

  const courseCode = event.pathParameters?.courseCode?.trim();
  if (!courseCode) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'courseCode path parameter is required' })
    };
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
    courseInput = resolveCoursePayload(payload, { requireCourseCode: false });
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: error.message })
      };
    }
    throw error;
  }

  if (courseInput.courseCode && courseInput.courseCode !== courseCode) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'courseCode in body must match path parameter' })
    };
  }

  const now = new Date().toISOString();
  const dynamodb = getDynamoDbDocumentClient();

  try {
    const result = await dynamodb.send(
      new UpdateCommand({
        TableName: COURSES_TABLE,
        Key: { courseCode },
        UpdateExpression:
          'SET #courseName = :courseName, #educatorName = :educatorName, #educatorEmail = :educatorEmail, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#courseName': 'courseName',
          '#educatorName': 'educatorName',
          '#educatorEmail': 'educatorEmail',
          '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
          ':courseName': courseInput.courseName,
          ':educatorName': courseInput.educatorName,
          ':educatorEmail': courseInput.educatorEmail,
          ':updatedAt': now
        },
        ConditionExpression: 'attribute_exists(courseCode)',
        ReturnValues: 'ALL_NEW'
      })
    );

    const attributes = result.Attributes as Record<string, unknown> | undefined;
    let payload: ReturnType<typeof toCourseRecord> | undefined;
    if (attributes) {
      try {
        payload = toCourseRecord(attributes);
      } catch (error) {
        if (error instanceof ValidationError) {
          console.warn('Returning sanitized course record after update', { error: error.message });
        } else {
          console.warn('Returning sanitized course record after update', { error });
        }
      }
    }

    const responseBody =
      payload ?? {
        courseCode,
        courseName: courseInput.courseName,
        educatorName: courseInput.educatorName,
        educatorEmail: courseInput.educatorEmail,
        updatedAt: now
      };

    return {
      statusCode: 200,
      body: JSON.stringify(responseBody)
    };
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Course not found' })
      };
    }
    console.error('Failed to update course assignment', { error });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to update course' })
    };
  }
};
