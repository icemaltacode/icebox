import axios from 'axios';
import { useCallback } from 'react';

import {
  createCourse,
  deleteCourse,
  deleteAdminUser,
  inviteAdminUser,
  listAdminUsers,
  listCourses,
  resetAdminUserPassword,
  type ListAdminUsersRequest,
  type ListAdminUsersResponse,
  type ListCoursesRequest,
  type ListCoursesResponse,
  type SaveCoursePayload,
  type UpdateAdminUserPayload,
  type InviteAdminUserPayload,
  updateAdminUser,
  updateCourse
} from '@/lib/admin-api';
import { useAdminAuth } from '@/providers/admin-auth-provider';

export const useAdminApi = () => {
  const { getValidSession, signOut } = useAdminAuth();

  const withToken = useCallback(
    async <T>(callback: (token: string) => Promise<T>): Promise<T> => {
      const session = await getValidSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      try {
        return await callback(session.idToken);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          signOut();
        }
        throw error;
      }
    },
    [getValidSession, signOut]
  );

  return {
    listCourses: (params?: ListCoursesRequest): Promise<ListCoursesResponse> =>
      withToken((token) => listCourses(token, params)),
    createCourse: (payload: SaveCoursePayload) =>
      withToken((token) => createCourse(token, payload)),
    updateCourse: (courseCode: string, payload: Omit<SaveCoursePayload, 'courseCode'>) =>
      withToken((token) => updateCourse(token, courseCode, payload)),
    deleteCourse: (courseCode: string) => withToken((token) => deleteCourse(token, courseCode)),
    listAdminUsers: (params?: ListAdminUsersRequest): Promise<ListAdminUsersResponse> =>
      withToken((token) => listAdminUsers(token, params)),
    inviteAdminUser: (payload: InviteAdminUserPayload) =>
      withToken((token) => inviteAdminUser(token, payload)),
    updateAdminUser: (username: string, payload: UpdateAdminUserPayload) =>
      withToken((token) => updateAdminUser(token, username, payload)),
    resetAdminUserPassword: (username: string) =>
      withToken((token) => resetAdminUserPassword(token, username)),
    deleteAdminUser: (username: string) =>
      withToken((token) => deleteAdminUser(token, username))
  };
};
