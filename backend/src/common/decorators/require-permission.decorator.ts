import { applyDecorators, SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_KEY = 'required_permission';
export const REQUIRED_PERMISSION_MODE_KEY = 'required_permission_mode';

/** `all` exige TODAS as permissões da lista; `any`, pelo menos uma. */
export type PermissionMode = 'all' | 'any';

/**
 * Exige a permissão — ou TODAS elas, quando recebe lista. É o modo padrão, e
 * continua valendo para todo decorator já escrito: sem metadata de modo, o
 * guard combina com AND.
 */
export const RequirePermission = (permission: string | string[]) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);

/**
 * Exige PELO MENOS UMA das permissões.
 *
 * Existe para a operação que pertence a mais de um verbo do mesmo recurso. O
 * caso que a motivou: definir a foto do produto é parte de CRIAR o produto e
 * parte de EDITAR o produto. Com AND puro, quem tem só `produtos.criar` cadastra
 * o produto e toma 403 ao anexar a foto no mesmo fluxo — e a tela escondia o
 * campo justamente para não expor esse 403.
 *
 * Não é afrouxamento geral: continua uma lista fechada, declarada na rota. Para
 * exigir combinação, use `RequirePermission` com lista.
 */
export const RequireAnyPermission = (...permissions: string[]) =>
  applyDecorators(
    SetMetadata(REQUIRED_PERMISSION_KEY, permissions),
    SetMetadata(REQUIRED_PERMISSION_MODE_KEY, 'any' satisfies PermissionMode),
  );
