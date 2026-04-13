import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OidcService {
  constructor(private readonly config: ConfigService) {}

  async exchangeCode(code: string, codeVerifier: string) {
    const authUrl = this.config.get<string>('AUTH_URL') ?? 'https://auth.zonadev.tech';
    const clientId = this.config.get<string>('OIDC_CLIENT_ID') ?? 'renowa';
    const redirectUri = this.config.get<string>('OIDC_REDIRECT_URI') ?? 'https://renowa.zonadev.tech/callback';

    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('client_id', clientId);
    body.set('code', code);
    body.set('redirect_uri', redirectUri);
    body.set('code_verifier', codeVerifier);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(`${authUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new BadRequestException(`Token exchange failed: ${res.status} ${text}`);
      }

      const data = await res.json();
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }
}
