import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { clearToken, getAccessToken } from '@/lib/auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: false,
  timeout: 30_000,
});

api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  config.headers = config.headers ?? {};
  (config.headers as any).Authorization = `Bearer ${token}`;
  return config;
});

// Interceptor de resposta — redireciona para login se 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      clearToken();
      useAuthStore.getState().clearAuth();
      const authUrl = import.meta.env.VITE_AUTH_URL ?? 'https://auth.zonadev.tech';
      const aud = import.meta.env.VITE_EXPECTED_AUD ?? 'renowa.zonadev.tech';
      window.location.href = `${authUrl}/login?app=${aud}&redirect=${encodeURIComponent(window.location.href)}`;
    }
    return Promise.reject(err);
  },
);

export default api;
