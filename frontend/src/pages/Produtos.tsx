import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Upload } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import Dialog from '@/components/ui/Dialog';
import { AsyncCombobox, type AsyncComboboxFetchResult } from '@/components/ui/AsyncCombobox';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { downloadProductsXlsxTemplate, fetchProducts, importProducts, type ImportProductsResult } from '@/services/products.service';
import { fetchSuppliers } from '@/services/suppliers.service';
import { getApiErrorMessage } from '@/lib/errors';
import type { Product, Supplier } from '@/types';
import { moneyForDisplay } from '@/lib/decimal';
import { CSV_TEMPLATE_HEADERS, downloadCsvTemplate } from '@/lib/csvTemplate';
import { Can } from '@/components/Can';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function supplierFetcher(search: string, page: number): Promise<AsyncComboboxFetchResult> {
  return fetchSuppliers({ search, page, limit: 20 }).then((result) => ({
    options: result.data.map((supplier: Supplier) => ({
      value: supplier.uuid,
      label: supplier.razao_social,
      description: supplier.cnpj ?? undefined,
    })),
    hasMore: result.meta.page < result.meta.totalPages,
  }));
}

export default function Produtos() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [fornecedorFiltroUuid, setFornecedorFiltroUuid] = useState<string | null>(null);
  const [fornecedorFiltroLabel, setFornecedorFiltroLabel] = useState('');

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFornecedorUuid, setImportFornecedorUuid] = useState<string | null>(null);
  const [importFornecedorLabel, setImportFornecedorLabel] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportProductsResult | null>(null);

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      fetchProducts({ ...params, search: debouncedSearch || undefined, fornecedor_uuid: fornecedorFiltroUuid || undefined }),
    [debouncedSearch, fornecedorFiltroUuid],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Product>({ fetcher });

  function openImportDialog() {
    setImportFile(null);
    setImportFornecedorUuid(null);
    setImportFornecedorLabel('');
    setImportError(null);
    setImportResult(null);
    setIsImportOpen(true);
  }

  async function handleImportSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!importFile) {
      setImportError('Selecione um arquivo .csv ou .xlsx para importar.');
      return;
    }
    if (!importFornecedorUuid) {
      setImportError('Selecione o fornecedor dos produtos importados.');
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const result = await importProducts(importFile, importFornecedorUuid);
      setImportResult(result);
      reload();
    } catch (err) {
      setImportError(getApiErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  const columns = [
    {
      key: 'descricao',
      header: 'Descrição',
      cell: (row: Product) => (
        <div>
          <p className='font-medium text-slate-900'>{row.descricao}</p>
          {row.codigo && <p className='text-xs text-slate-500'>Cód: {row.codigo}</p>}
        </div>
      ),
    },
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      cell: (row: Product) => row.fornecedor?.razao_social ?? '—',
    },
    {
      key: 'quantidade',
      header: 'Quantidade',
      cell: (row: Product) => row.quantidade,
    },
    {
      key: 'preco_base',
      header: 'Preço Base',
      // preco_base é nullable no modelo de dados
      cell: (row: Product) => row.preco_base != null ? BRL.format(moneyForDisplay(row.preco_base)) : '—',
    },
    {
      key: 'ipi_perc',
      header: 'IPI',
      cell: (row: Product) => row.ipi_perc != null ? `${row.ipi_perc}%` : '—',
    },
    {
      key: 'acoes',
      header: 'Ações',
      cell: (row: Product) => (
        <Can permission='produtos.editar' fallback={<span className='text-xs text-slate-400'>—</span>}>
          <button
            type='button'
            onClick={() => navigate(`/produtos/${row.uuid}/editar`)}
            className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
          >
            Editar
          </button>
        </Can>
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div className='flex flex-1 flex-wrap items-center gap-3'>
          <div className='relative flex-1 max-w-sm'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400' />
            <input
              type='text'
              placeholder='Buscar produto...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='w-full rounded-lg border bg-white py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/40'
            />
          </div>
          <div className='w-64'>
            <AsyncCombobox
              ariaLabel='Filtrar por fornecedor'
              value={fornecedorFiltroUuid}
              displayValue={fornecedorFiltroLabel}
              onChange={(value, option) => {
                setFornecedorFiltroUuid(value);
                setFornecedorFiltroLabel(option?.label ?? '');
              }}
              fetcher={supplierFetcher}
              placeholder='Filtrar por fornecedor...'
              emptyMessage='Nenhum fornecedor encontrado.'
              errorMessage='Não foi possível carregar os fornecedores.'
            />
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Can permission='produtos.criar'>
            <button
              onClick={openImportDialog}
              className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors'
            >
              <Upload className='h-4 w-4' />
              Importar produtos
            </button>
          </Can>
          <Can permission='produtos.criar'>
            <button
              onClick={() => navigate('/produtos/novo')}
              className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 transition-colors'
            >
              <Plus className='h-4 w-4' />
              Novo Produto
            </button>
          </Can>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        error={error}
        onRetry={reload}
        meta={meta ?? undefined}
        onPageChange={goToPage}
        emptyTitle='Nenhum produto cadastrado'
      />

      {isImportOpen && (
        <Dialog open title='Importar produtos' onClose={() => setIsImportOpen(false)} className='max-w-lg'>
          <form onSubmit={handleImportSubmit} className='space-y-4'>
            {importError && (
              <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
                {importError}
              </div>
            )}

            <div className='flex flex-col gap-1'>
              <label htmlFor='import-fornecedor' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Fornecedor <span className='text-red-500'>*</span>
              </label>
              <AsyncCombobox
                id='import-fornecedor'
                ariaLabel='Fornecedor dos produtos importados'
                required
                value={importFornecedorUuid}
                displayValue={importFornecedorLabel}
                onChange={(value, option) => {
                  setImportFornecedorUuid(value);
                  setImportFornecedorLabel(option?.label ?? '');
                }}
                fetcher={supplierFetcher}
                placeholder='Buscar fornecedor por nome ou CNPJ...'
                emptyMessage='Nenhum fornecedor encontrado.'
                errorMessage='Não foi possível carregar os fornecedores.'
              />
            </div>

            <div className='flex flex-col gap-1'>
              <label htmlFor='import-arquivo' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Arquivo (.csv ou .xlsx) <span className='text-red-500'>*</span>
              </label>
              <input
                id='import-arquivo'
                type='file'
                accept='.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
              <p className='text-xs text-slate-500'>
                O arquivo precisa ter uma linha de cabeçalho com as colunas{' '}
                <code className='rounded bg-slate-100 px-1'>codigo</code>,{' '}
                <code className='rounded bg-slate-100 px-1'>descricao</code> e{' '}
                <code className='rounded bg-slate-100 px-1'>preco_base</code>,{' '}
                <code className='rounded bg-slate-100 px-1'>ipi_perc</code> e{' '}
                <code className='rounded bg-slate-100 px-1'>foto</code>. No XLSX, ancore uma imagem flutuante na célula <code className='rounded bg-slate-100 px-1'>foto</code> da mesma linha. O modo “Imagem na célula” não é aceito. Máximo de 5.000 linhas e 500 imagens.
              </p>
              <button
                type='button'
                onClick={() => downloadCsvTemplate('modelo-produtos.csv', CSV_TEMPLATE_HEADERS.produtos)}
                className='self-start text-sm font-medium text-primary underline-offset-2 hover:underline'
              >
                Baixar modelo (.csv)
              </button>
              <button type='button' onClick={() => void downloadProductsXlsxTemplate()}
                className='ml-4 self-start text-sm font-medium text-primary underline-offset-2 hover:underline'>
                Baixar modelo (.xlsx)
              </button>
            </div>

            {importResult && (
              <div className='space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm'>
                <p className='font-medium text-slate-800'>
                  {importResult.criados} criado(s), {importResult.atualizados} atualizado(s), {importResult.rejeitados} rejeitado(s).
                </p>
                <p className='text-xs text-slate-600'>{importResult.fotosCriadas} foto(s) criada(s), {importResult.fotosIgnoradas} preservada(s).</p>
                {importResult.erros.length > 0 && (
                  <div className='max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white'>
                    <table className='w-full text-xs'>
                      <thead>
                        <tr className='bg-slate-100 text-left text-slate-600'>
                          <th className='px-2 py-1'>Linha</th>
                          <th className='px-2 py-1'>Código</th>
                          <th className='px-2 py-1'>Erro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.erros.map((erro, index) => (
                          <tr key={index} className='border-t border-slate-100'>
                            <td className='px-2 py-1'>{erro.linha}</td>
                            <td className='px-2 py-1'>{erro.codigo || '—'}</td>
                            <td className='px-2 py-1 text-red-700'>{erro.erro}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className='flex justify-end gap-3 pt-2'>
              <button type='button' onClick={() => setIsImportOpen(false)} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
                Fechar
              </button>
              <button type='submit' disabled={importing} className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'>
                {importing ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
