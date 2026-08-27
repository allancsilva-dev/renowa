import api from '@/lib/apiClient';
import type { ApiResponse, CnpjLookupResult } from '@/types';

/**
 * Consulta de apoio ao preenchimento do formulário — sem RBAC própria,
 * apenas autenticação (decisão confirmada). 404 (CNPJ não encontrado) e 503
 * (serviço indisponível) devem ser tratados pelo chamador como falha não
 * bloqueante — os campos continuam editáveis manualmente.
 */
export async function lookupCnpj(cnpj: string, options?: { signal?: AbortSignal }): Promise<CnpjLookupResult> {
  const { data } = await api.get<ApiResponse<CnpjLookupResult>>(`/consultas/cnpj/${cnpj}`, { signal: options?.signal });
  return data.data;
}
