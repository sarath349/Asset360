import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { BranchProvider } from './context/BranchContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';
import './styles.css';

const isDesktop = Boolean(window.asset360Desktop?.isDesktop);
if ('serviceWorker' in navigator && import.meta.env.PROD && !isDesktop) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <DataProvider>
            <BranchProvider>
              <App />
            </BranchProvider>
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
