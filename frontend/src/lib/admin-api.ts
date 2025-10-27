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
