import { ConflictException } from '@nestjs/common';

const CNPJ_UNIQUE_CONSTRAINTS = new Set([
  'uq_clientes_tenant_cnpj_active',
  'uq_fornecedores_tenant_cnpj_active',
  'uq_transportadoras_tenant_cnpj_active',
]);

/** Converte a violação do índice de CNPJ em resposta estável para a API. */
export function rethrowCnpjUniqueViolation(error: unknown, resource: string): never {
  const dbError = error as { code?: string; constraint?: string };
  if (dbError?.code === '23505' && CNPJ_UNIQUE_CONSTRAINTS.has(dbError.constraint ?? '')) {
    throw new ConflictException(`Este CNPJ já existe no cadastro de ${resource}.`);
  }
  throw error;
}
