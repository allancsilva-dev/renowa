import { ROLE_TEMPLATES, formatRoleName } from '@renowa/shared';

export interface RoleOption {
  name: string;
  label: string;
  /** Perfil real do tenant que não concede nada — quem entrar nele toma 403. */
  semPermissoes: boolean;
}

export interface TenantRoleSummary {
  name: string;
  permissions?: readonly string[];
}

/**
 * Perfis atribuíveis: os que já existem no tenant (`GET /roles`, incluindo os
 * criados sob medida na tela de Perfis) mais os templates que o backend sabe
 * provisionar sob demanda (`ROLE_TEMPLATES` em `@renowa/shared`).
 *
 * Só os templates não bastava: o backend aceita qualquer perfil existente do
 * tenant, mas a tela oferecia apenas os quatro fixos — perfil sob medida podia
 * ser criado e configurado, e mesmo assim não podia ser atribuído a ninguém.
 * Só reaparecia ao editar um usuário que já o tivesse.
 *
 * Templates continuam na lista porque um perfil de template pode ainda não ter
 * sido materializado neste tenant; escolhê-lo é o que dispara a criação.
 */
export function mergeRoleOptions(tenantRoles: readonly TenantRoleSummary[]): RoleOption[] {
  const byName = new Map<string, RoleOption>();

  for (const role of tenantRoles) {
    byName.set(role.name, {
      name: role.name,
      label: formatRoleName(role.name),
      // Perfil sem nenhuma permissão é o que FIX-0028 existia para não deixar
      // ninguém escolher por engano: o usuário loga e toma 403 em toda tela.
      // Aqui ele não pode ser escondido — é um perfil real do tenant, e
      // esconder o tornaria inatribuível de novo. Fica visível e rotulado.
      semPermissoes: (role.permissions?.length ?? 0) === 0,
    });
  }

  for (const template of ROLE_TEMPLATES) {
    if (!byName.has(template.name)) byName.set(template.name, { ...template, semPermissoes: false });
  }

  const options = [...byName.values()];

  // `formatRoleName` faz title-case, então `VENDEDOR` e `vendedor` — perfis
  // distintos, com ids distintos — renderizavam o MESMO rótulo "Vendedor", sem
  // como diferenciar na tela. Quando o rótulo colide, mostra o nome cru.
  const rotuloRepetido = new Set(
    options.map((o) => o.label).filter((label, i, todos) => todos.indexOf(label) !== i),
  );

  return options
    .map((option) => ({
      ...option,
      label: rotuloRepetido.has(option.label) ? `${option.label} (${option.name})` : option.label,
    }))
    .map((option) => ({
      ...option,
      label: option.semPermissoes ? `${option.label} — sem permissões` : option.label,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}
