import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './lib/app.jsx';
import StudentApp from './student/StudentApp.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <StudentApp />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
