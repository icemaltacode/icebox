import axios from 'axios';

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
  completedAt: string;
  files: Array<{
    fileName: string;
    objectKey: string;
    downloadUrl: string;
    contentType?: string | null;
    size?: number | null;
    expiresAt?: string;
  }>;
};

export const createUploadSession = async (payload: CreateUploadSessionPayload) => {
  const { data } = await api.post<CreateUploadSessionResponse>('/uploads/sessions', payload);
  return data;
};

export const completeUpload = async (payload: CompleteUploadPayload) => {
  const { submissionId, ...rest } = payload;
  const { data } = await api.post<CompleteUploadResponse>(
    `/uploads/${submissionId}/complete`,
    rest
  );
  return data;
};

export const listStudentSubmissions = async (studentId: string, courseId?: string) => {
  const { data } = await api.get<{ items: unknown[] }>(
    `/students/${studentId}/submissions`,
    courseId ? { params: { courseId } } : undefined
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
  const { data } = await api.get<{ items: PublicCourse[] }>('/courses');
  return data.items;
};
