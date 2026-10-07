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
  restoreRequestedAt?: string | null;
  restoreRequestedBy?: string | null;
  restoreCompletedAt?: string | null;
  restoreExpiresAt?: string | null;
  projectName?: string | null;
  driveUploadedAt?: string | null;
  driveUploadedBy?: string | null;
  backupCheckedAt?: string | null;
  backupCheckedBy?: string | null;
};

const PROJECT_NAME_MAX_LENGTH = 200;

export const normalizeProjectName = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/\s+/g, ' ').trim().slice(0, PROJECT_NAME_MAX_LENGTH).trim();
  return normalized.length > 0 ? normalized : null;
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
    downloadBaseUrl: optionalString(item.downloadBaseUrl) ?? null,
    restoreRequestedAt: optionalString(item.restoreRequestedAt) ?? null,
    restoreRequestedBy: optionalString(item.restoreRequestedBy) ?? null,
    restoreCompletedAt: optionalString(item.restoreCompletedAt) ?? null,
    restoreExpiresAt: optionalString(item.restoreExpiresAt) ?? null,
    projectName: optionalString(item.projectName) ?? null,
    driveUploadedAt: optionalString(item.driveUploadedAt) ?? null,
    driveUploadedBy: optionalString(item.driveUploadedBy) ?? null,
    backupCheckedAt: optionalString(item.backupCheckedAt) ?? null,
    backupCheckedBy: optionalString(item.backupCheckedBy) ?? null
  };
};

type DownloadNameSource = {
  courseId?: string | null;
  projectName?: string | null;
  studentName?: string | null;
  studentEmail?: string | null;
  studentId?: string | null;
};

const FILE_NAME_SEGMENT_MAX_LENGTH = 80;

// Strips characters that are invalid in filenames on common platforms and collapses whitespace.
const toFileNameSegment = (value: string | null | undefined): string =>
  (value ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FILE_NAME_SEGMENT_MAX_LENGTH)
    .trim();

export const isArchiveObjectKey = (objectKey: string): boolean => objectKey.startsWith('archives/');

// Builds a human-readable download name: <course>_<project>_<student>.zip for archives, and the
// same prefix plus the original file name for single-file submissions.
export const buildDownloadFileName = (
  source: DownloadNameSource,
  file: { fileName?: string | null; objectKey: string }
): string => {
  const prefix = [
    source.courseId,
    source.projectName,
    source.studentName ?? source.studentEmail ?? source.studentId
  ]
    .map(toFileNameSegment)
    .filter((segment) => segment.length > 0)
    .join('_');

  if (isArchiveObjectKey(file.objectKey)) {
    return `${prefix || 'submission'}.zip`;
  }

  const originalName = (file.fileName ?? file.objectKey).split('/').pop() ?? '';
  const baseName = toFileNameSegment(originalName) || 'file';
  return prefix ? `${prefix}_${baseName}` : baseName;
};

const encodeRfc5987 = (value: string): string =>
  encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

// The ASCII fallback is for clients that ignore filename*. Maltese ħ has no Unicode decomposition,
// so it is mapped by hand; other accented letters lose their diacritics through NFKD.
const toAsciiFileName = (value: string): string =>
  value
    .replace(/ħ/g, 'h')
    .replace(/Ħ/g, 'H')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/["\\]/g, '');

export const buildContentDisposition = (fileName: string): string =>
  `inline; filename="${toAsciiFileName(fileName) || 'download'}"; filename*=UTF-8''${encodeRfc5987(fileName)}`;

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
