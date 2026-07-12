import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { AppShell } from './components/AppShell.jsx';
import { DocumentsListPage } from './pages/DocumentsListPage.jsx';
import { NewDocumentPage } from './pages/NewDocumentPage.jsx';
import { DocumentEditorPage } from './pages/DocumentEditorPage.jsx';
import { SignInPage } from './pages/SignInPage.jsx';
import { useSession } from './lib/hooks.js';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

function Guarded({ children }) {
  const { session, loading } = useSession();
  if (loading) return <div className="p-10 text-center text-neutral-500">Loading…</div>;
  if (!session) return <Navigate to="/sign-in" replace />;
  return children;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/" element={<Guarded><AppShell /></Guarded>}>
            <Route index element={<Navigate to="/documents" replace />} />
            <Route path="documents" element={<DocumentsListPage />} />
            <Route path="documents/new" element={<NewDocumentPage />} />
            <Route path="documents/:id" element={<DocumentEditorPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
