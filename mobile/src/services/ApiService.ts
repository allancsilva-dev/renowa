import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import * as SecureStore from 'expo-secure-store';

const SESSION_TOKEN_KEY = 'renowa_session_token';
const USER_DATA_KEY = 'renowa_user_data';
const LAST_SYNC_KEY = 'renowa_last_sync';

export interface MobileUser {
  uuid: string;
  nome: string;
  roles: string[];
  tenantId: string;
}

class ApiService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api',
      timeout: 30_000,
    });

    // Injeta token de sessão em todas as requests
    this.client.interceptors.request.use(async (config) => {
      const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    });
  }

  // ── Auth ──────────────────────────────────────────────────

  /**
   * Estágio 1: troca JWT RS256 do ZonaDevAuth por sessão mobile HS256.
   * Requer conexão com internet.
   */
  async createMobileSession(zonadevToken: string, deviceInfo?: string): Promise<MobileUser> {
    const { data } = await this.client.post<{
      data: { token: string; user: MobileUser };
    }>(
      '/auth/mobile-session',
      { device_info: deviceInfo },
      { headers: { Authorization: `Bearer ${zonadevToken}` } },
    );

    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, data.data.token);
    await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(data.data.user));

    return data.data.user;
  }

  async getStoredUser(): Promise<MobileUser | null> {
    const raw = await SecureStore.getItemAsync(USER_DATA_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MobileUser;
  }

  async hasValidSession(): Promise<boolean> {
    const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    if (!token) return false;

    try {
      // Decodifica o payload sem verificar assinatura (verificação é feita no servidor)
      const payload = JSON.parse(atob(token.split('.')[1])) as { exp: number };
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_DATA_KEY);
    await SecureStore.deleteItemAsync(LAST_SYNC_KEY);
  }

  // ── Sync helpers ──────────────────────────────────────────

  async getLastSyncTimestamp(): Promise<string | null> {
    return SecureStore.getItemAsync(LAST_SYNC_KEY);
  }

  async setLastSyncTimestamp(timestamp: string): Promise<void> {
    await SecureStore.setItemAsync(LAST_SYNC_KEY, timestamp);
  }

  // ── HTTP methods ──────────────────────────────────────────

  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config);
  }

  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config);
  }

  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.patch<T>(url, data, config);
  }

  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config);
  }
}

export const apiService = new ApiService();
