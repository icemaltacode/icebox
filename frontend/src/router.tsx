import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';

import { AppLayout } from '@/components/layouts/app-layout';
import { UploadPage } from '@/routes/upload-page';

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<AppLayout />}>
      <Route index element={<UploadPage />} />
    </Route>
  )
);
