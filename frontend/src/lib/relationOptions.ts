import type { AsyncComboboxFetchResult, AsyncComboboxOption } from '@/components/ui/AsyncCombobox';
import { fetchClients } from '@/services/clients.service';
import { fetchProducts } from '@/services/products.service';
import { fetchSuppliers } from '@/services/suppliers.service';
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
