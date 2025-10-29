import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

import { getDynamoDbDocumentClient } from '../../lib/aws';
import { ASSIGNMENTS_TABLE } from '../../lib/env';
import { AdminAuthConfigurationError, requireAdminClaims, UnauthorizedError } from '../../lib/adminAuth';
import {
  calculateArchiveTransitionAt,
  calculateDeletionAt,
  sumFileSizes,
  toSubmissionRecord,
  SubmissionFileRecord
} from '../../lib/submissions';
import { ValidationError } from '../../lib/errors';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const SCAN_PAGE_SIZE = 100;

const SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'completedAt',
  'lastAccessedAt',
  'courseId',
  'courseName',
  'educatorName',
  'studentName',
  'status',
  'fileCount',
  'totalSize'
] as const;

type SortField = (typeof SORT_FIELDS)[number];

type EnrichedSubmission = {
  submissionId: string;
  courseId: string;
  courseName: string | null;
  educatorName: string | null;
  educatorEmails: string[];
  studentName: string | null;
  studentEmail: string | null;
  studentId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string | null;
  completedAt: string | null;
  firstAccessedAt: string | null;
  lastAccessedAt: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  comment: string | null;
  files: SubmissionFileRecord[];
  fileCount: number;
  totalSize: number;
  archiveTransitionAt: string | null;
  deletionAt: string | null;
  downloadBaseUrl: string | null;
};

const normalizeSortField = (value: string | undefined): SortField => {
  if (!value) {
    return 'createdAt';
  }
  const candidate = value as SortField;
  return SORT_FIELDS.includes(candidate) ? candidate : 'createdAt';
};

const parseList = (value: string | undefined): string[] =>
  value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];

const parseDate = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const compareValues = (left: unknown, right: unknown, order: 'asc' | 'desc'): number => {
  const modifier = order === 'desc' ? -1 : 1;

  if (typeof left === 'number' && typeof right === 'number') {
    return left === right ? 0 : left < right ? -1 * modifier : 1 * modifier;
  }

  const leftString = left ? left.toString().toLowerCase() : '';
  const rightString = right ? right.toString().toLowerCase() : '';

  if (leftString < rightString) {
    return -1 * modifier;
  }
  if (leftString > rightString) {
    return 1 * modifier;
  }
  return 0;
};

const getSortValue = (submission: EnrichedSubmission, field: SortField): unknown => {
  switch (field) {
    case 'totalSize':
      return submission.totalSize;
    case 'fileCount':
      return submission.fileCount;
    default:
      return submission[field] ?? '';
  }
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    await requireAdminClaims(event.headers);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }
    if (error instanceof AdminAuthConfigurationError) {
      console.error('Admin authentication not configured', { message: error.message });
      return { statusCode: 500, body: JSON.stringify({ message: 'Admin authentication not configured' }) };
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

  const search = (query.search ?? '').trim().toLowerCase();
  const statusFilter = parseList(query.status).map((value) => value.toUpperCase());
  const courseFilter = parseList(query.courseId).map((value) => value.toLowerCase());
  const educatorFilter = parseList(query.educatorEmail).map((value) => value.toLowerCase());
  const studentFilter = (query.student ?? '').trim().toLowerCase();
  const accessedFilter = (query.accessed ?? '').trim().toLowerCase();
  const createdAfter = parseDate(query.createdAfter);
  const createdBefore = parseDate(query.createdBefore);
  const sortField = normalizeSortField(query.sortField);
  const sortOrder: 'asc' | 'desc' = query.sortOrder === 'asc' ? 'asc' : 'desc';

  const dynamodb = getDynamoDbDocumentClient();
  const submissions: EnrichedSubmission[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  try {
    do {
      const response = await dynamodb.send(
        new ScanCommand({
          TableName: ASSIGNMENTS_TABLE,
          Limit: SCAN_PAGE_SIZE,
          ExclusiveStartKey: lastEvaluatedKey
        })
      );

      const items = response.Items ?? [];
      for (const item of items) {
        try {
          const record = toSubmissionRecord(item as Record<string, unknown>);

          if (record.deletedAt) {
            continue;
          }

          const fileCount = record.files.length;
          const totalSize = sumFileSizes(record.files);
          const archiveTransitionAt = calculateArchiveTransitionAt(record);
          const deletionAt = calculateDeletionAt(record);

          submissions.push({
            submissionId: record.submissionId,
            courseId: record.courseId,
            courseName: record.courseName ?? null,
            educatorName: record.courseEducatorName ?? null,
            educatorEmails: record.educatorEmails,
            studentName: record.studentName ?? null,
            studentEmail: record.studentEmail ?? null,
            studentId: record.studentId ?? null,
            status: record.status,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt ?? null,
            completedAt: record.completedAt ?? null,
            firstAccessedAt: record.firstAccessedAt ?? null,
            lastAccessedAt: record.lastAccessedAt ?? null,
            reminderCount: record.reminderCount ?? 0,
            lastReminderAt: record.lastReminderAt ?? null,
            comment: record.comment ?? null,
            files: record.files,
            fileCount,
            totalSize,
            archiveTransitionAt,
            deletionAt,
            downloadBaseUrl: record.downloadBaseUrl ?? null
          });
        } catch (error) {
          if (error instanceof ValidationError) {
            console.warn('Skipping malformed submission record', { message: error.message });
          } else {
            console.warn('Skipping malformed submission record', { error });
          }
        }
      }

      lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);
  } catch (error) {
    console.error('Failed to scan submissions table', { error });
    return { statusCode: 500, body: JSON.stringify({ message: 'Failed to load submissions' }) };
  }

  const filtered = submissions.filter((submission) => {
    if (statusFilter.length > 0 && !statusFilter.includes(submission.status.toUpperCase())) {
      return false;
    }

    if (courseFilter.length > 0 && !courseFilter.includes(submission.courseId.toLowerCase())) {
      return false;
    }

    if (
      educatorFilter.length > 0 &&
      !submission.educatorEmails.some((email) => educatorFilter.includes(email.toLowerCase()))
    ) {
      return false;
    }

    if (studentFilter) {
      const haystacks = [
        submission.studentName,
        submission.studentEmail,
        submission.studentId
      ]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase());

      if (!haystacks.some((value) => value.includes(studentFilter))) {
        return false;
      }
    }

    if (createdAfter && Date.parse(submission.createdAt) < createdAfter) {
      return false;
    }

    if (createdBefore && Date.parse(submission.createdAt) > createdBefore) {
      return false;
    }

    if (accessedFilter === 'viewed' && !submission.lastAccessedAt) {
      return false;
    }

    if (accessedFilter === 'not_viewed' && submission.lastAccessedAt) {
      return false;
    }

    if (!search) {
      return true;
    }

    const searchableValues = [
      submission.submissionId,
      submission.courseId,
      submission.courseName ?? '',
      submission.educatorName ?? '',
      submission.studentName ?? '',
      submission.studentEmail ?? '',
      submission.studentId ?? '',
      submission.status,
      submission.comment ?? '',
      ...submission.files.map((file) => file.fileName ?? '')
    ]
      .filter((value) => value && value.length > 0)
      .map((value) => value.toLowerCase());

    return searchableValues.some((value) => value.includes(search));
  });

  const sorted = filtered.sort((left, right) => {
    const leftValue = getSortValue(left, sortField);
    const rightValue = getSortValue(right, sortField);

    if (
      (sortField === 'createdAt' ||
        sortField === 'updatedAt' ||
        sortField === 'completedAt' ||
        sortField === 'lastAccessedAt') &&
      typeof leftValue === 'string' &&
      typeof rightValue === 'string'
    ) {
      const leftTimestamp = Date.parse(leftValue);
      const rightTimestamp = Date.parse(rightValue);
      if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp)) {
        return compareValues(leftTimestamp, rightTimestamp, sortOrder);
      }
    }

    return compareValues(leftValue, rightValue, sortOrder);
  });

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
      totalPages,
      totalCount
    })
  };
};
