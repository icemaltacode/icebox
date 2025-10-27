import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

import { getDynamoDbDocumentClient } from '../lib/aws';
import { COURSES_TABLE } from '../lib/env';

type CourseRecord = {
  courseCode: string;
  courseName?: string;
  educatorName?: string;
  educatorEmail?: string;
};

const sanitizeCourse = (item: Record<string, unknown>): CourseRecord | null => {
  const courseCode = typeof item.courseCode === 'string' ? item.courseCode : null;
  if (!courseCode) {
    return null;
  }

  const courseName = typeof item.courseName === 'string' ? item.courseName : undefined;
  const educatorName = typeof item.educatorName === 'string' ? item.educatorName : undefined;
  const educatorEmail = typeof item.educatorEmail === 'string' ? item.educatorEmail : undefined;

  return {
    courseCode,
    courseName,
    educatorName,
    educatorEmail
  };
};

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const dynamodb = getDynamoDbDocumentClient();
  const courses: CourseRecord[] = [];

  let lastEvaluatedKey: Record<string, unknown> | undefined;

  try {
    do {
      const response = await dynamodb.send(
        new ScanCommand({
          TableName: COURSES_TABLE,
          ExclusiveStartKey: lastEvaluatedKey
        })
      );

      const items = response.Items ?? [];
      for (const item of items) {
        const sanitized = sanitizeCourse(item as Record<string, unknown>);
        if (sanitized) {
          courses.push(sanitized);
        }
      }

      lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);
  } catch (error) {
    console.error('Failed to fetch courses', { error });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to load courses' })
    };
  }

  courses.sort((a, b) => {
    const nameA = (a.courseName ?? '').toLowerCase();
    const nameB = (b.courseName ?? '').toLowerCase();
    if (nameA !== nameB) {
      return nameA.localeCompare(nameB);
    }
    return a.courseCode.localeCompare(b.courseCode);
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      items: courses
    })
  };
};
