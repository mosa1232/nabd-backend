import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from './lib/app.jsx';
import StudentApp from './student/StudentApp.jsx';

// the dashboard is a separate chunk: students never download it
const AdminApp = lazy(() => import('./admin/AdminApp.jsx').then(m => ({ default: m.default })));
const AdminShell = lazy(() => import('./admin/AdminApp.jsx').then(m => ({ default: m.default })));

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/admin" element={<AdminApp />} />
            <Route path="/admin/:section" element={<AdminShell />} />
            <Route path="/*" element={<StudentApp />} />
          </Routes>
        </Suspense>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
