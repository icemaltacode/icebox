import { ValidationError } from './errors';

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const toEmailArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
};

export type SubmissionFileRecord = {
  fileName?: string | null;
  contentType?: string | null;
  size?: number | null;
  objectKey: string;
  downloadToken?: string | null;
  expiresAt?: string | null;
};

export type SubmissionRecord = {
  submissionId: string;
  courseId: string;
  courseName?: string | null;
  courseEducatorName?: string | null;
  courseEducatorEmail?: string | null;
  educatorEmails: string[];
  studentId?: string | null;
  studentName?: string | null;
  studentEmail?: string | null;
  comment?: string | null;
  status: string;
  createdAt: string;
  updatedAt?: string | null;
  completedAt?: string | null;
  files: SubmissionFileRecord[];
  firstAccessedAt?: string | null;
  lastAccessedAt?: string | null;
  accessCount?: number;
  lastReminderAt?: string | null;
  lastReminderBy?: string | null;
  reminderCount?: number;
  deletedAt?: string | null;
  deletedBy?: string | null;
  downloadBaseUrl?: string | null;
};

const toSubmissionFileRecord = (item: unknown): SubmissionFileRecord | undefined => {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return undefined;
  }

  const record = item as Record<string, unknown>;
  const objectKey = optionalString(record.objectKey);
  if (!objectKey) {
    return undefined;
  }

  return {
    fileName: record.fileName as string | null | undefined,
    contentType: record.contentType as string | null | undefined,
    size: optionalNumber(record.size) ?? null,
    objectKey,
    downloadToken: record.downloadToken as string | null | undefined,
    expiresAt: record.expiresAt as string | null | undefined
  };
};

export const toSubmissionRecord = (item: Record<string, unknown>): SubmissionRecord => {
  const submissionId = optionalString(item.submissionId);
  const courseId = optionalString(item.courseId);
  const createdAt = optionalString(item.createdAt);
  const status = optionalString(item.status) ?? 'PENDING';

  if (!submissionId) {
    throw new ValidationError('Submission record is missing submissionId');
  }

  if (!courseId) {
    throw new ValidationError('Submission record is missing courseId');
  }

  if (!createdAt) {
    throw new ValidationError('Submission record is missing createdAt');
  }

  const rawFiles = Array.isArray(item.files) ? item.files : [];
  const files = rawFiles
    .map((entry) => toSubmissionFileRecord(entry))
    .filter((entry): entry is SubmissionFileRecord => Boolean(entry));

  return {
    submissionId,
    courseId,
    courseName: optionalString(item.courseName) ?? null,
    courseEducatorName: optionalString(item.courseEducatorName) ?? null,
    courseEducatorEmail: optionalString(item.courseEducatorEmail) ?? null,
    educatorEmails: toEmailArray(item.educatorEmails),
    studentId: optionalString(item.studentId) ?? null,
    studentName: optionalString(item.studentName) ?? null,
    studentEmail: optionalString(item.studentEmail) ?? null,
    comment: optionalString(item.comment) ?? null,
    status,
    createdAt,
    updatedAt: optionalString(item.updatedAt) ?? null,
    completedAt: optionalString(item.completedAt) ?? null,
    files,
    firstAccessedAt: optionalString(item.firstAccessedAt) ?? null,
    lastAccessedAt: optionalString(item.lastAccessedAt) ?? null,
    accessCount: optionalNumber(item.accessCount),
    lastReminderAt: optionalString(item.lastReminderAt) ?? null,
    lastReminderBy: optionalString(item.lastReminderBy) ?? null,
    reminderCount: optionalNumber(item.reminderCount),
    deletedAt: optionalString(item.deletedAt) ?? null,
    deletedBy: optionalString(item.deletedBy) ?? null,
    downloadBaseUrl: optionalString(item.downloadBaseUrl) ?? null
  };
};

export const calculateArchiveTransitionAt = (record: SubmissionRecord): string | null => {
  const baseIso = record.completedAt ?? record.createdAt;
  const base = Date.parse(baseIso);
  if (Number.isNaN(base)) {
    return null;
  }
  const transition = new Date(base);
  transition.setUTCDate(transition.getUTCDate() + 30);
  return transition.toISOString();
};

export const calculateDeletionAt = (record: SubmissionRecord): string | null => {
  const baseIso = record.completedAt ?? record.createdAt;
  const base = Date.parse(baseIso);
  if (Number.isNaN(base)) {
    return null;
  }
  const deletion = new Date(base);
  deletion.setUTCDate(deletion.getUTCDate() + 180);
  return deletion.toISOString();
};

export const sumFileSizes = (files: SubmissionFileRecord[]): number =>
  files.reduce((total, file) => total + (typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : 0), 0);
