import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

declare global {
  interface Window {
    __auth_storage_cleared__?: boolean;
  }
}

if (!window.__auth_storage_cleared__) {
  localStorage.removeItem('auth-storage');
  window.__auth_storage_cleared__ = true;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
