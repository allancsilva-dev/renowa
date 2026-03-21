import {
  BadGatewayException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type UnknownRecord = Record<string, unknown>;

@Injectable()
export class AuthApiService {
  private readonly authUrl: string;
  private readonly internalSecret: string;

  constructor(private readonly config: ConfigService) {
    this.authUrl = this.config.getOrThrow<string>('AUTH_URL');
    this.internalSecret = this.config.getOrThrow<string>('AUTH_INTERNAL_SECRET');
  }

  private extractUserId(user: UnknownRecord): string | null {
    const candidates = ['authUserId', 'id', 'uuid', 'userId', 'sub'];
    for (const key of candidates) {
      const value = user[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return null;
  }

  private normalizeUsersPayload(payload: unknown): UnknownRecord[] {
    if (Array.isArray(payload)) {
      return payload.filter((item): item is UnknownRecord => !!item && typeof item === 'object');
    }

    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const obj = payload as UnknownRecord;
    const data = obj.data;
    const users = obj.users;

    if (Array.isArray(data)) {
      return data.filter((item): item is UnknownRecord => !!item && typeof item === 'object');
    }

    if (data && typeof data === 'object') {
      return [data as UnknownRecord];
    }

    if (Array.isArray(users)) {
      return users.filter((item): item is UnknownRecord => !!item && typeof item === 'object');
    }

    return [];
  }

  // Dívida técnica: evoluir para Service Token (JWT de serviço) quando múltiplos
  // backends precisarem consumir o Auth de forma padronizada.
  async resolveAuthUserIdByEmail(email: string): Promise<string | null> {

    const url = `${this.authUrl}/users?email=${encodeURIComponent(email)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Internal-Secret': this.internalSecret,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `Falha ao consultar ZonaDev Auth (${response.status})`,
      );
    }

    const payload: unknown = await response.json();
    const users = this.normalizeUsersPayload(payload);

    const found = users.find((item) => {
      const value = item.email;
      return typeof value === 'string' && value.toLowerCase() === email.toLowerCase();
    }) ?? users[0];

    if (!found) {
      return null;
    }

    return this.extractUserId(found);
  }
}
