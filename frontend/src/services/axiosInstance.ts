import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,  // envia cookies HTTP-only automaticamente
  timeout: 30_000,
});

// Interceptor de resposta — redireciona para login se 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      useAuthStore.getState().clearAuth();
      const authUrl = import.meta.env.VITE_AUTH_URL ?? 'https://auth.zonadev.tech';
      const aud = import.meta.env.VITE_AUTH_AUD ?? 'renowa.zonadev.tech';
      window.location.href = `${authUrl}?aud=${aud}&redirect=${encodeURIComponent(window.location.href)}`;
    }
    return Promise.reject(err);
  },
);

export default api;
