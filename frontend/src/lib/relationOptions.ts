import type { AsyncComboboxFetchResult, AsyncComboboxOption } from '@/components/ui/AsyncCombobox';
import { fetchClients } from '@/services/clients.service';
import { fetchProducts } from '@/services/products.service';
import { fetchSuppliers } from '@/services/suppliers.service';
import { fetchPrepostos } from '@/services/prepostos.service';
import api from '@/lib/apiClient';
import type { PaginatedResponse, Transport } from '@/types';

const PAGE_SIZE = 20;

export function clientOptionsFetcher(search: string, page: number): Promise<AsyncComboboxFetchResult> {
  return fetchClients({ search, page, limit: PAGE_SIZE }).then((result) => ({
    options: result.data.map((client) => ({
      value: client.uuid,
      label: client.razao_social,
      description: client.cnpj ?? undefined,
      data: client,
    })),
    hasMore: result.meta.page < result.meta.totalPages,
  }));
}

export function supplierOptionsFetcher(search: string, page: number): Promise<AsyncComboboxFetchResult> {
  return fetchSuppliers({ search, page, limit: PAGE_SIZE }).then((result) => ({
    options: result.data.map((supplier) => ({
      value: supplier.uuid,
      label: supplier.razao_social,
      description: supplier.cnpj ?? undefined,
      data: supplier,
    })),
    hasMore: result.meta.page < result.meta.totalPages,
  }));
}

export function transportOptionsFetcher(search: string, page: number): Promise<AsyncComboboxFetchResult> {
  return api.get<PaginatedResponse<Transport>>('/transportadoras', {
    params: { search, page, limit: PAGE_SIZE },
  }).then(({ data: result }) => ({
    options: result.data.map((transport) => ({
      value: transport.uuid,
      label: transport.razao_social,
      description: transport.cnpj ?? transport.telefone ?? undefined,
      data: transport,
    })),
    hasMore: result.meta.page < result.meta.totalPages,
  }));
}

export function productOptionsFetcher(
  supplierUuid: string,
  search: string,
  page: number,
): Promise<AsyncComboboxFetchResult> {
  if (!supplierUuid) return Promise.resolve({ options: [], hasMore: false });
  return fetchProducts({ search, page, limit: PAGE_SIZE, fornecedor_uuid: supplierUuid }).then((result) => ({
    options: result.data.map((product) => ({
      value: product.uuid,
      label: product.codigo ? `${product.codigo} — ${product.descricao}` : product.descricao,
      description: `${product.quantidade} un./caixa`,
      data: product,
    })),
    hasMore: result.meta.page < result.meta.totalPages,
  }));
}

export function filterLocalOptions(
  options: AsyncComboboxOption[],
  search: string,
  page: number,
): AsyncComboboxFetchResult {
  const normalized = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = normalized
    ? options.filter((option) => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(normalized))
    : options;
  const start = (page - 1) * PAGE_SIZE;
  return { options: filtered.slice(start, start + PAGE_SIZE), hasMore: start + PAGE_SIZE < filtered.length };
}

/**
 * Campo "Vendedor" do pedido: usuários do tenant + prepostos (representantes
 * externos, sem login). Os dois vão para colunas diferentes no backend
 * (`vendedor_uuid` x `preposto_uuid`), então o valor do preposto carrega um
 * prefixo — uuid de usuário nunca tem `:`.
 */
export const PREPOSTO_OPTION_PREFIX = 'preposto:';

export function prepostoOptionLabel(nome: string): string {
  return `${nome} · Preposto`;
}

export function sellerOptionsFetcher(users: AsyncComboboxOption[], includePrepostos: boolean) {
  return async (search: string, page: number): Promise<AsyncComboboxFetchResult> => {
    const local = filterLocalOptions(users, search, page);
    if (!includePrepostos) return local;
    // Sem permissão de ver prepostos (ou falha transitória), o campo continua
    // servindo para escolher usuário.
    const result = await fetchPrepostos({ search: search.trim() || undefined, page, limit: PAGE_SIZE }).catch(() => null);
    if (!result) return local;
    return {
      options: [
        ...local.options,
        ...result.data.map((preposto) => ({
          value: `${PREPOSTO_OPTION_PREFIX}${preposto.uuid}`,
          label: prepostoOptionLabel(preposto.nome),
        })),
      ],
      hasMore: local.hasMore || result.meta.page < result.meta.totalPages,
    };
  };
}

/** Valor do combobox → par de campos do payload. Exatamente um preenchido (ou nenhum). */
export function splitSellerValue(value: string | null): { vendedor_uuid: string; preposto_uuid: string } {
  if (!value) return { vendedor_uuid: '', preposto_uuid: '' };
  if (value.startsWith(PREPOSTO_OPTION_PREFIX)) {
    return { vendedor_uuid: '', preposto_uuid: value.slice(PREPOSTO_OPTION_PREFIX.length) };
  }
  return { vendedor_uuid: value, preposto_uuid: '' };
}

export function sellerValue(fields: { vendedor_uuid: string; preposto_uuid: string }): string | null {
  if (fields.preposto_uuid) return `${PREPOSTO_OPTION_PREFIX}${fields.preposto_uuid}`;
  return fields.vendedor_uuid || null;
}
