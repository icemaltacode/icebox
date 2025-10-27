import { createBrowserRouter, createRoutesFromElements, Navigate, Route } from 'react-router-dom';

import { AdminLayout } from '@/components/layouts/admin-layout';
import { AppLayout } from '@/components/layouts/app-layout';
import { AdminAssignmentsPage, AdminGate, AdminUsersPage } from '@/routes/admin';
import { UploadPage } from '@/routes/upload-page';

export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<UploadPage />} />
      </Route>
      <Route path="/admin" element={<AdminGate />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="assignments" replace />} />
          <Route path="assignments" element={<AdminAssignmentsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
        </Route>
      </Route>
    </>
  )
);
