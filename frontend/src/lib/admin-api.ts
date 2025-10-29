import { api } from '@/lib/api';

export type CourseAssignment = {
  courseCode: string;
  courseName: string;
  educatorName: string;
  educatorEmail: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ListCoursesRequest = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortField?: 'courseCode' | 'courseName' | 'educatorName' | 'educatorEmail';
  sortOrder?: 'asc' | 'desc';
};

export type ListCoursesResponse = {
  items: CourseAssignment[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type SaveCoursePayload = {
  courseCode: string;
  courseName: string;
  educatorName: string;
  educatorEmail: string;
};

export type AdminUser = {
  username: string;
  email?: string;
  status: string | null;
  enabled: boolean;
  emailVerified?: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  createdAt?: string;
  updatedAt?: string;
  lastModifiedAt?: string;
};

export type ListAdminUsersRequest = {
  limit?: number;
  nextToken?: string | null;
  search?: string;
};

export type ListAdminUsersResponse = {
  items: AdminUser[];
  nextToken?: string | null;
  count: number;
};

export type InviteAdminUserPayload = {
  email: string;
  givenName?: string;
  familyName?: string;
  name?: string;
  resend?: boolean;
};

export type UpdateAdminUserPayload = {
  name?: string;
  givenName?: string;
  familyName?: string;
};

export type AdminSubmissionFile = {
  fileName?: string | null;
  contentType?: string | null;
  size?: number | null;
  objectKey: string;
  downloadToken?: string | null;
  expiresAt?: string | null;
};

export type AdminSubmission = {
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
  files: AdminSubmissionFile[];
  fileCount: number;
  totalSize: number;
  archiveTransitionAt: string | null;
  deletionAt: string | null;
  downloadBaseUrl: string | null;
};

export type ListSubmissionsRequest = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  courseId?: string;
  educatorEmail?: string;
  student?: string;
  accessed?: 'viewed' | 'not_viewed';
  sortField?:
    | 'createdAt'
    | 'updatedAt'
    | 'completedAt'
    | 'lastAccessedAt'
    | 'courseId'
    | 'courseName'
    | 'educatorName'
    | 'studentName'
    | 'status'
    | 'fileCount'
    | 'totalSize';
  sortOrder?: 'asc' | 'desc';
};

export type ListSubmissionsResponse = {
  items: AdminSubmission[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
};

const withAuthHeader = (token: string) => ({
  headers: {
    Authorization: `Bearer ${token}`
  }
});

export const listCourses = async (
  token: string,
  params: ListCoursesRequest = {}
): Promise<ListCoursesResponse> => {
  const { data } = await api.get<ListCoursesResponse>('/admin/courses', {
    params,
    ...withAuthHeader(token)
  });
  return data;
};

export const createCourse = async (token: string, payload: SaveCoursePayload): Promise<CourseAssignment> => {
  const { data } = await api.post<CourseAssignment>('/admin/courses', payload, withAuthHeader(token));
  return data;
};

export const updateCourse = async (
  token: string,
  courseCode: string,
  payload: Omit<SaveCoursePayload, 'courseCode'>
): Promise<CourseAssignment> => {
  const { data } = await api.put<CourseAssignment>(
    `/admin/courses/${encodeURIComponent(courseCode)}`,
    payload,
    withAuthHeader(token)
  );
  return data;
};

export const deleteCourse = async (token: string, courseCode: string): Promise<void> => {
  await api.delete(`/admin/courses/${encodeURIComponent(courseCode)}`, withAuthHeader(token));
};

export const listAdminUsers = async (
  token: string,
  params: ListAdminUsersRequest = {}
): Promise<ListAdminUsersResponse> => {
  const { data } = await api.get<ListAdminUsersResponse>('/admin/users', {
    params,
    ...withAuthHeader(token)
  });
  return data;
};

export const inviteAdminUser = async (
  token: string,
  payload: InviteAdminUserPayload
): Promise<AdminUser> => {
  const { data } = await api.post<AdminUser>('/admin/users', payload, withAuthHeader(token));
  return data;
};

export const updateAdminUser = async (
  token: string,
  username: string,
  payload: UpdateAdminUserPayload
): Promise<{ username: string; updated: Record<string, string | null> }> => {
  const { data } = await api.put<{ username: string; updated: Record<string, string | null> }>(
    `/admin/users/${encodeURIComponent(username)}`,
    payload,
    withAuthHeader(token)
  );
  return data;
};

export const resetAdminUserPassword = async (token: string, username: string): Promise<void> => {
  await api.post(`/admin/users/${encodeURIComponent(username)}/reset-password`, undefined, withAuthHeader(token));
};

export const deleteAdminUser = async (token: string, username: string): Promise<void> => {
  await api.delete(`/admin/users/${encodeURIComponent(username)}`, withAuthHeader(token));
};

export const listSubmissions = async (
  token: string,
  params: ListSubmissionsRequest
): Promise<ListSubmissionsResponse> => {
  const { data } = await api.get<ListSubmissionsResponse>('/admin/submissions', {
    params,
    ...withAuthHeader(token)
  });
  return data;
};

export const remindSubmission = async (token: string, submissionId: string): Promise<void> => {
  await api.post(`/admin/submissions/${encodeURIComponent(submissionId)}/remind`, undefined, withAuthHeader(token));
};

export const deleteSubmission = async (token: string, submissionId: string): Promise<void> => {
  await api.delete(`/admin/submissions/${encodeURIComponent(submissionId)}`, withAuthHeader(token));
};
