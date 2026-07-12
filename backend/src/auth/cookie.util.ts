import { Response } from 'express';
import { ACCESS_TOKEN_TTL_SECONDS } from './access-token.service';
import { REFRESH_TOKEN_TTL_MS } from './refresh-token.service';

const AT_COOKIE = 'renowa_at';
const RT_COOKIE = 'renowa_rt';
const RT_PATH = '/api/auth';

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookie(AT_COOKIE, tokens.accessToken, {
    httpOnly: true, secure: true, sameSite: 'strict', path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(RT_COOKIE, tokens.refreshToken, {
    httpOnly: true, secure: true, sameSite: 'strict', path: RT_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(AT_COOKIE, { path: '/' });
  res.clearCookie(RT_COOKIE, { path: RT_PATH });
}

export { AT_COOKIE, RT_COOKIE };
