import axios from 'axios';

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
      // Limpa estado local e redireciona para o ZonaDevAuth
      window.location.href =
        `${import.meta.env.VITE_AUTH_URL ?? 'https://auth.zonadev.tech'}/login` +
        `?redirect=${encodeURIComponent(window.location.href)}`;
    }
    return Promise.reject(err);
  },
);

export default api;
