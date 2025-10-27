import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

import { getDynamoDbDocumentClient } from '../../lib/aws';
import { CourseRecord, toCourseRecord } from '../../lib/courses';
import { AdminAuthConfigurationError, requireAdminClaims, UnauthorizedError } from '../../lib/adminAuth';
import { ValidationError } from '../../lib/errors';
import { COURSES_TABLE } from '../../lib/env';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const SCAN_PAGE_LIMIT = 100;

const SORT_FIELDS = ['courseCode', 'courseName', 'educatorName', 'educatorEmail'] as const;
type SortField = (typeof SORT_FIELDS)[number];

const normalizeSortField = (value: string | undefined): SortField => {
  if (!value) {
    return 'courseCode';
  }
  const candidate = value as SortField;
  if (SORT_FIELDS.includes(candidate)) {
    return candidate;
  }
  return 'courseCode';
};

const sortRecords = (records: CourseRecord[], field: SortField, order: 'asc' | 'desc') => {
  const modifier = order === 'desc' ? -1 : 1;
  return [...records].sort((left, right) => {
    const a = (left[field] ?? '').toString().toLowerCase();
    const b = (right[field] ?? '').toString().toLowerCase();
    if (a < b) {
      return -1 * modifier;
    }
    if (a > b) {
      return 1 * modifier;
    }
    return 0;
  });
};

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

  const query = event.queryStringParameters ?? {};
  const requestedPageSize = Number.parseInt(query.pageSize ?? '', 10);
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(Math.max(requestedPageSize, 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  const requestedPage = Number.parseInt(query.page ?? '', 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const search = (query.search ?? '').toLowerCase().trim();
  const sortField = normalizeSortField(query.sortField);
  const sortOrder: 'asc' | 'desc' = query.sortOrder === 'desc' ? 'desc' : 'asc';

  const dynamodb = getDynamoDbDocumentClient();
  const records: CourseRecord[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  try {
    do {
      const response = await dynamodb.send(
        new ScanCommand({
          TableName: COURSES_TABLE,
          Limit: SCAN_PAGE_LIMIT,
          ExclusiveStartKey: lastEvaluatedKey
        })
      );
      const items = response.Items ?? [];
      for (const item of items) {
        try {
          const record = toCourseRecord(item as Record<string, unknown>);
          records.push(record);
        } catch (error) {
          if (error instanceof ValidationError) {
            console.warn('Skipping malformed course record', { error: error.message });
          } else {
            console.warn('Skipping malformed course record', { error });
          }
        }
      }
      lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);
  } catch (error) {
    console.error('Failed to scan courses table', { error });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to load courses' })
    };
  }

  const filtered = search
    ? records.filter((record) => {
        const haystacks = [
          record.courseCode,
          record.courseName,
          record.educatorName,
          record.educatorEmail
        ]
          .filter(Boolean)
          .map((value) => value.toLowerCase());
        return haystacks.some((value) => value.includes(search));
      })
    : records;

  const sorted = sortRecords(filtered, sortField, sortOrder);
  const totalCount = sorted.length;
  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const items = sorted.slice(startIndex, startIndex + pageSize);

  return {
    statusCode: 200,
    body: JSON.stringify({
      items,
      page: safePage,
      pageSize,
      totalCount,
      totalPages
    })
  };
};
