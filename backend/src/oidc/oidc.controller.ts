import { Controller, Get, Query, Req, Res, BadRequestException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { OidcService } from './oidc.service';

function base64UrlEncode(buffer: Buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

@Controller('auth/oidc')
export class OidcController {
  constructor(private readonly config: ConfigService, private readonly oidc: OidcService) {}

  @Public()
  @Get('start')
  start(@Query('return_to') returnTo: string | undefined, @Res() res: Response) {
    const codeVerifier = randomBytes(64).toString('base64url');
    const hash = createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = base64UrlEncode(hash);
    const state = randomUUID();

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      maxAge: 5 * 60 * 1000,
      domain: '.zonadev.tech',
      path: '/',
    };

    res.cookie('oidc_verifier', codeVerifier, cookieOptions);
    res.cookie('oidc_state', state, cookieOptions);
    res.cookie('oidc_return', returnTo ?? '/dashboard', cookieOptions);

    const authUrl = this.config.get<string>('AUTH_URL') ?? 'https://auth.zonadev.tech';
    const clientId = this.config.get<string>('OIDC_CLIENT_ID') ?? 'renowa';
    const redirectUri = this.config.get<string>('OIDC_REDIRECT_URI') ?? 'https://renowa.zonadev.tech/callback';

    const redirectTo = new URL(`${authUrl}/oauth/authorize`);
    redirectTo.searchParams.set('client_id', clientId);
    redirectTo.searchParams.set('redirect_uri', redirectUri);
    redirectTo.searchParams.set('response_type', 'code');
    redirectTo.searchParams.set('scope', 'openid');
    redirectTo.searchParams.set('code_challenge', codeChallenge);
    redirectTo.searchParams.set('code_challenge_method', 'S256');
    redirectTo.searchParams.set('state', state);

    return res.redirect(302, redirectTo.toString());
  }

  @Public()
  @Get('callback')
  async callback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Req() req: Request, @Res() res: Response) {
    if (!code || !state) {
      throw new BadRequestException('Missing code or state');
    }

    const cookies = req.cookies as Record<string, string | undefined>;
    const oidcState = cookies['oidc_state'];
    const oidcVerifier = cookies['oidc_verifier'];

    if (!oidcState || !oidcVerifier) {
      throw new BadRequestException('OIDC cookies not present');
    }

    if (state !== oidcState) {
      throw new BadRequestException('State inválido');
    }

    try {
      const tokenResponse = await this.oidc.exchangeCode(code, oidcVerifier);

      const accessToken = tokenResponse['access_token'];
      const expiresIn = Number(tokenResponse['expires_in'] ?? 0);
      if (!accessToken) {
        throw new BadRequestException('Token nao retornado pelo provedor');
      }

      const cookieName = this.config.get<string>('AUTH_COOKIE_NAME') ?? 'renowa_access_token';
      res.cookie(cookieName, accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        domain: '.zonadev.tech',
        path: '/',
        maxAge: expiresIn * 1000,
      });

      // Clear temporary cookies
      res.clearCookie('oidc_verifier', { domain: '.zonadev.tech', path: '/' });
      res.clearCookie('oidc_state', { domain: '.zonadev.tech', path: '/' });

      const returnTo = cookies['oidc_return'] ?? '/dashboard';
      res.clearCookie('oidc_return', { domain: '.zonadev.tech', path: '/' });

      return res.status(200).json({ ok: true, redirect: returnTo });
    } catch (err: unknown) {
      const message = (err as Error)?.message ?? 'Erro na troca de token';
      return res.status(400).json({ error: String(message) });
    }
  }

  @Public()
  @Get('logout')
  logout(@Res() res: Response) {
    const cookieName = this.config.get<string>('AUTH_COOKIE_NAME') ?? 'renowa_access_token';
    res.clearCookie(cookieName, { domain: '.zonadev.tech', path: '/' });

    const authUrl = this.config.get<string>('AUTH_URL') ?? 'https://auth.zonadev.tech';
    const logoutRedirect = this.config.get<string>('OIDC_LOGOUT_REDIRECT') ?? 'https://renowa.zonadev.tech';

    return res.json({ redirect: `${authUrl}/logout?redirect=${encodeURIComponent(logoutRedirect)}` });
  }

}
