import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

import { getDynamoDbDocumentClient } from '../lib/aws';
import { ASSIGNMENTS_TABLE } from '../lib/env';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const studentId = event.pathParameters?.studentId;
  if (!studentId) {
    return { statusCode: 400, body: JSON.stringify({ message: 'studentId is required' }) };
  }

  const courseId = event.queryStringParameters?.courseId;

  const dynamodb = getDynamoDbDocumentClient();
  const queryInput = courseId
    ? {
        TableName: ASSIGNMENTS_TABLE,
        IndexName: 'byStudent',
        KeyConditionExpression: 'studentId = :studentId AND courseId = :courseId',
        ExpressionAttributeValues: {
          ':studentId': studentId,
          ':courseId': courseId
        }
      }
    : {
        TableName: ASSIGNMENTS_TABLE,
        IndexName: 'byStudent',
        KeyConditionExpression: 'studentId = :studentId',
        ExpressionAttributeValues: {
          ':studentId': studentId
        }
      };

  const result = await dynamodb.send(new QueryCommand(queryInput));

  return {
    statusCode: 200,
    body: JSON.stringify({
      items: result.Items ?? []
    })
  };
};
