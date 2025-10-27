import { ValidationError } from './errors';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const ensureString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export type CourseDetails = {
  courseName: string;
  educatorName: string;
  educatorEmail: string;
};

export type CourseRecord = CourseDetails & {
  courseCode: string;
  createdAt?: string;
  updatedAt?: string;
};

type ResolveCoursePayloadOptions = {
  requireCourseCode?: boolean;
};

export const resolveCoursePayload = (
  raw: unknown,
  options: ResolveCoursePayloadOptions = {}
): CourseRecord => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ValidationError('Request body must be a JSON object');
  }

  const data = raw as Record<string, unknown>;
  const courseCode = ensureString(data.courseCode);
  const courseName = ensureString(data.courseName);
  const educatorName = ensureString(data.educatorName);
  const educatorEmail = ensureString(data.educatorEmail).toLowerCase();

  if (options.requireCourseCode !== false && !courseCode) {
    throw new ValidationError('courseCode is required');
  }

  if (!courseName) {
    throw new ValidationError('courseName is required');
  }

  if (!educatorName) {
    throw new ValidationError('educatorName is required');
  }

  if (!educatorEmail) {
    throw new ValidationError('educatorEmail is required');
  }

  if (!emailPattern.test(educatorEmail)) {
    throw new ValidationError('educatorEmail must be a valid email address');
  }

  return {
    courseCode,
    courseName,
    educatorName,
    educatorEmail
  };
};

export const toCourseRecord = (item: Record<string, unknown>): CourseRecord => {
  const courseCode = optionalString(item.courseCode);
  if (!courseCode) {
    throw new ValidationError('Stored course record is missing courseCode');
  }

  const courseName = optionalString(item.courseName) ?? '';
  const educatorName = optionalString(item.educatorName) ?? '';
  const educatorEmail = optionalString(item.educatorEmail) ?? '';

  return {
    courseCode,
    courseName,
    educatorName,
    educatorEmail,
    createdAt: optionalString(item.createdAt),
    updatedAt: optionalString(item.updatedAt)
  };
};
