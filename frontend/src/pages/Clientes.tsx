import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Pencil, Plus, Trash2, Upload, Search } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import ImportCsvDialog from '@/components/ImportCsvDialog';
import { CSV_TEMPLATE_HEADERS } from '@/lib/csvTemplate';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { fetchClients, deleteClient } from '@/services/clients.service';
import { importClientes } from '@/services/import';
import type { Client } from '@/types';
import { Can } from '@/components/Can';
import { RowAction, RowActions } from '@/components/tables/RowActions';
import DetailDialog from '@/components/ui/DetailDialog';
import { getApiErrorMessage } from '@/lib/errors';

export default function Clientes() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [viewing, setViewing] = useState<Client | null>(null);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      fetchClients({ ...params, search: debouncedSearch }),
    [debouncedSearch],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Client>({ fetcher });

  async function handleDelete(client: Client) {
    if (deletingUuid) return;
    if (!window.confirm(`Remover o cliente "${client.razao_social}"?`)) return;
    setDeletingUuid(client.uuid);
    setRowActionError(null);
    try {
      await deleteClient(client.uuid);
      reload();
    } catch (err) {
      setRowActionError(getApiErrorMessage(err));
    } finally {
      setDeletingUuid(null);
    }
  }

  const columns = [
    {
      key: 'razao_social',
      header: 'Razão Social',
      cell: (row: Client) => (
        <p className='font-medium text-slate-900'>{row.razao_social}</p>
      ),
    },
    {
      key: 'cnpj',
      header: 'CNPJ',
      cell: (row: Client) => row.cnpj ?? '—',
    },
    {
      key: 'tel',
      header: 'Telefone',
      cell: (row: Client) => row.tel ?? '—',
    },
    {
      key: 'email',
      header: 'E-mail',
      cell: (row: Client) => row.email ?? '—',
    },
    {
      key: 'cidade',
      header: 'Cidade / UF',
      cell: (row: Client) =>
        row.cidade ? `${row.cidade}${row.uf ? ` / ${row.uf}` : ''}` : '—',
    },
    {
      key: 'acoes',
      header: 'Ações',
      cell: (row: Client) => (
        <RowActions>
          <RowAction icon={Eye} label={`Ver ${row.razao_social}`} onClick={() => setViewing(row)} />
          <Can permission='clientes.editar'>
            <RowAction
              icon={Pencil}
              label={`Editar ${row.razao_social}`}
              onClick={() => navigate(`/clientes/${row.uuid}/editar`)}
            />
          </Can>
          <Can permission='clientes.deletar'>
            <RowAction
              icon={Trash2}
              danger
              label={`Remover ${row.razao_social}`}
              disabled={deletingUuid === row.uuid}
              onClick={() => handleDelete(row)}
            />
          </Can>
        </RowActions>
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      {/* Toolbar */}
      <div className='flex items-center justify-between gap-4'>
        <div className='relative flex-1 max-w-sm'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400' />
          <input
            type='text'
            placeholder='Buscar cliente...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-full rounded-lg border bg-white py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/40'
          />
        </div>

        <div className='flex items-center gap-2'>
          {/* Importar grava em massa: exige a mesma permissão de criar. */}
          <Can permission='clientes.criar'>
            <button
              onClick={() => setIsImportOpen(true)}
              className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors'
            >
              <Upload className='h-4 w-4' />
              Importar
            </button>
          </Can>
          <Can permission='clientes.criar'>
            <button
              onClick={() => navigate('/clientes/novo')}
              className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors'
            >
              <Plus className='h-4 w-4' />
              Novo Cliente
            </button>
          </Can>
        </div>
      </div>

      {rowActionError && (
        <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>
          {rowActionError}
        </div>
      )}

      {/* Conteúdo */}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        error={error}
        onRetry={reload}
        meta={meta ?? undefined}
        onPageChange={goToPage}
        emptyTitle='Nenhum cliente cadastrado'
        emptyDescription='Clique em "Novo Cliente" para começar.'
      />

      {viewing && (
        <DetailDialog
          title='Cliente'
          onClose={() => setViewing(null)}
          fields={[
            { label: 'Razão Social', value: viewing.razao_social },
            { label: 'CNPJ', value: viewing.cnpj },
            { label: 'E-mail', value: viewing.email },
            { label: 'Telefone', value: viewing.tel },
            { label: 'Contato', value: viewing.contato },
            { label: 'Endereço', value: viewing.endereco },
            { label: 'Número', value: viewing.numero },
            { label: 'Complemento', value: viewing.complemento },
            { label: 'Bairro', value: viewing.bairro },
            { label: 'Cidade / UF', value: viewing.cidade ? `${viewing.cidade}${viewing.uf ? ` / ${viewing.uf}` : ''}` : null },
            { label: 'CEP', value: viewing.cep },
            { label: 'Inscrição Estadual', value: viewing.inscricao_estadual },
            { label: 'Suframa', value: viewing.suframa },
            { label: 'Pagamento padrão', value: viewing.pgt_padrao },
            { label: 'Prazo', value: viewing.prazo },
            { label: 'Local de entrega', value: viewing.local_entrega },
            { label: 'Transportadora', value: viewing.transportadora?.razao_social ?? null },
            { label: 'Observação', value: viewing.observacao },
          ]}
          footer={
            <Can permission='clientes.editar'>
              <button
                type='button'
                onClick={() => navigate(`/clientes/${viewing.uuid}/editar`)}
                className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors'
              >
                Editar
              </button>
            </Can>
          }
        />
      )}

      {isImportOpen && (
        <ImportCsvDialog
          title='Importar clientes'
          template={{ filename: 'modelo-clientes.csv', header: CSV_TEMPLATE_HEADERS.clientes }}
          importFn={importClientes}
          onImported={reload}
          onClose={() => setIsImportOpen(false)}
          help={
            <>
              O arquivo precisa ter uma linha de cabeçalho com{' '}
              <code className='rounded bg-slate-100 px-1'>razao_social</code> (obrigatório). Colunas opcionais:{' '}
              <code className='rounded bg-slate-100 px-1'>cnpj</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>email</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>tel</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>endereco</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>numero</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>complemento</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>bairro</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>cidade</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>uf</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>cep</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>contato</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>inscricao_estadual</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>suframa</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>pgt_padrao</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>prazo</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>local_entrega</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>observacao</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>transportadora_cnpj</code> (vincula a transportadora existente).
              Registros com o mesmo CNPJ são atualizados.
            </>
          }
        />
      )}
    </div>
  );
}
