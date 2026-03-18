export interface JwtPayload {
  sub: string;           // uuid do usuário no ZonaDevAuth
  jti: string;           // uuid único do token
  tokenVersion: number;
  tenantId: string;      // uuid do tenant
  tenantSubdomain: string;
  plan: string;
  roles: string[];       // CHANGELOG #7: sempre array
  email?: string;
  defaultRole?: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export interface RequestUser {
  sub: string;
  tenantId: string;
  tenantSubdomain: string;
  roles: string[];       // CHANGELOG #7: sempre array
  plan: string;
  tokenVersion: number;
  jti: string;
  email?: string;
  defaultRole?: string;
}
