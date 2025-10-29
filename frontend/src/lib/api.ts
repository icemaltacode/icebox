import axios, { type AxiosRequestConfig } from 'axios';

import { getVleAuthToken } from './vleToken';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const api = axios.create({
  baseURL: API_BASE_URL
});

export type UploadSessionFile = {
  fileName: string;
  contentType: string | null;
  size: number | null;
  objectKey: string;
  uploadUrl: string;
  downloadToken?: string;
  expiresAt?: string;
};

export type CreateUploadSessionResponse = {
  submissionId: string;
  expiresInSeconds: number;
  files: UploadSessionFile[];
};

export type CreateUploadSessionPayload = {
  studentId?: string;
  studentName?: string;
  courseId: string;
  comment?: string;
  studentEmail?: string;
  educatorEmails?: string[];
  files: Array<{
    fileName: string;
    contentType: string | null;
    size: number;
  }>;
};

export type CompleteUploadPayload = {
  submissionId: string;
  comment?: string;
  studentEmail?: string;
  studentName?: string;
  educatorEmails?: string[];
};

export type CompleteUploadResponse = {
  submissionId: string;
  status: string;
  archiveRequestedAt: string;
  attributes?: Record<string, unknown>;
};

export type UploadStatusResponse = {
  submissionId: string;
  status: string;
  createdAt?: string;
  archiveRequestedAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
  files: Array<{
    fileName?: string | null;
    objectKey: string;
    downloadToken: string;
    downloadUrl: string | null;
    contentType?: string | null;
    size?: number | null;
    expiresAt?: string | null;
  }>;
};

const addAuthHeader = (headers?: Record<string, string>) => {
  const token = getVleAuthToken();
  const requireToken = import.meta.env.VITE_REQUIRE_VLE_TOKEN === 'true';
  const authToken = token || (requireToken ? null : 'dev-access');
  if (!authToken) return headers;
  return { ...(headers ?? {}), Authorization: `Bearer ${authToken}` };
};

export const createUploadSession = async (payload: CreateUploadSessionPayload) => {
  const headers = addAuthHeader();
  const config: AxiosRequestConfig | undefined = headers ? { headers } : undefined;
  const { data } = await api.post<CreateUploadSessionResponse>('/uploads/sessions', payload, config);
  return data;
};

export const completeUpload = async (payload: CompleteUploadPayload) => {
  const { submissionId, ...rest } = payload;
  const headers = addAuthHeader();
  const config: AxiosRequestConfig | undefined = headers ? { headers } : undefined;
  const { data } = await api.post<CompleteUploadResponse>(
    `/uploads/${submissionId}/complete`,
    rest,
    config
  );
  return data;
};

export const getUploadStatus = async (submissionId: string) => {
  const headers = addAuthHeader();
  const config: AxiosRequestConfig | undefined = headers ? { headers } : undefined;
  const { data } = await api.get<UploadStatusResponse>(`/uploads/${submissionId}`, config);
  return data;
};

export const listStudentSubmissions = async (studentId: string, courseId?: string) => {
  const headers = addAuthHeader();
  let config: AxiosRequestConfig | undefined;
  if (courseId) {
    config = { params: { courseId } };
  }
  if (headers) {
    config = { ...(config ?? {}), headers };
  }

  const { data } = await api.get<{ items: unknown[] }>(
    `/students/${studentId}/submissions`,
    config
  );
  return data.items;
};

export type PublicCourse = {
  courseCode: string;
  courseName?: string;
  educatorName?: string;
  educatorEmail?: string;
};

export const listPublicCourses = async (): Promise<PublicCourse[]> => {
  const headers = addAuthHeader();
  const config: AxiosRequestConfig | undefined = headers ? { headers } : undefined;
  const { data } = await api.get<{ items: PublicCourse[] }>('/courses', config);
  return data.items;
};

export const exchangeVleToken = async (shortToken: string): Promise<string> => {
  const { data } = await api.post<{ token: string }>('/vle-token/exchange', { token: shortToken });
  return data.token;
};
