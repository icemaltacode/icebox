import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';

import { getDynamoDbDocumentClient } from '../../lib/aws';
import { AdminAuthConfigurationError, requireAdminClaims, UnauthorizedError } from '../../lib/adminAuth';
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

  const dynamodb = getDynamoDbDocumentClient();
  try {
    await dynamodb.send(
      new DeleteCommand({
        TableName: COURSES_TABLE,
        Key: { courseCode },
        ConditionExpression: 'attribute_exists(courseCode)'
      })
    );
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Course not found' })
      };
    }
    console.error('Failed to delete course assignment', { error });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to delete course' })
    };
  }

  return {
    statusCode: 204,
    body: ''
  };
};
