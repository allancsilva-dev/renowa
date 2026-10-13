import { useCallback, useState } from 'react';
import { BadgeCheck, Percent, Undo2 } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import { RowMenu, type RowMenuItem } from '@/components/tables/RowMenu';
import Dialog from '@/components/ui/Dialog';
import { AsyncCombobox, type AsyncComboboxFetchResult } from '@/components/ui/AsyncCombobox';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useAuth } from '@/hooks/useAuth';
import {
  alterarPercentualVenda, fetchPrepostoVendas, fetchPrepostos, registrarPagamentoVenda,
  type PrepostoVenda, type PrepostoVendasTotais,
} from '@/services/prepostos.service';
import { moneyForDisplay } from '@/lib/decimal';
import { formatDate } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass =
  'min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

type StatusFiltro = '' | 'pendente' | 'pago';

/** Data civil de hoje em São Paulo — `toISOString` vira o dia seguinte depois das 21h. */
function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function prepostoFetcher(search: string, page: number): Promise<AsyncComboboxFetchResult> {
  return fetchPrepostos({ search: search.trim() || undefined, page, limit: 20 }).then((result) => ({
    options: result.data.map((preposto) => ({ value: preposto.uuid, label: preposto.nome })),
    hasMore: result.meta.page < result.meta.totalPages,
  }));
}

/**
 * Aba "Vendas": cada nota fiscal de pedido com preposto. O percentual de cada
 * venda é ajustável enquanto pendente; pagar lança a saída no Financeiro
 * (precisa de financeiro.editar) e estornar a remove.
 */
export default function PrepostosVendas() {
  const { hasPermission } = useAuth();
  const canAlterarPercentual = hasPermission('prepostos.editar');
  const canPagar = hasPermission('financeiro.editar');

  const [prepostoUuid, setPrepostoUuid] = useState<string | null>(null);
  const [prepostoLabel, setPrepostoLabel] = useState('');
  const [status, setStatus] = useState<StatusFiltro>('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');

  const [percentualVenda, setPercentualVenda] = useState<PrepostoVenda | null>(null);
  const [percentual, setPercentual] = useState('');
  const [pagarVenda, setPagarVenda] = useState<PrepostoVenda | null>(null);
  const [dataPagamento, setDataPagamento] = useState('');
  const [estornarVenda, setEstornarVenda] = useState<PrepostoVenda | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Período só vale completo: meio período é ignorado em vez de virar 400.
  const periodoValido = Boolean(inicio && fim && inicio <= fim);
  const periodoInvertido = Boolean(inicio && fim && inicio > fim);

  const fetcher = useCallback(
    (params: { page: number; limit: number }) => fetchPrepostoVendas({
      ...params,
      preposto_uuid: prepostoUuid ?? undefined,
      status: status || undefined,
      data_inicio: periodoValido ? inicio : undefined,
      data_fim: periodoValido ? fim : undefined,
    }),
    [prepostoUuid, status, periodoValido, inicio, fim],
  );
  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<PrepostoVenda>({ fetcher });
  const totais = (meta as (typeof meta & { totais?: PrepostoVendasTotais }) | null)?.totais;

  function closeDialogs() {
    setPercentualVenda(null);
    setPagarVenda(null);
    setEstornarVenda(null);
    setFormError(null);
  }

  async function run(action: () => Promise<unknown>) {
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await action();
      closeDialogs();
      reload();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function handlePercentual(event: React.FormEvent) {
    event.preventDefault();
    if (!percentualVenda) return;
    const value = Number(percentual.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setFormError('Percentual deve estar entre 0 e 100.');
      return;
    }
    void run(() => alterarPercentualVenda(percentualVenda.uuid, {
      perc_comissao: Math.round(value * 100) / 100, version: percentualVenda.version,
    }));
  }

  function handlePagar(event: React.FormEvent) {
    event.preventDefault();
    if (!pagarVenda) return;
    if (!dataPagamento) { setFormError('Informe a data do pagamento.'); return; }
    void run(() => registrarPagamentoVenda(pagarVenda.uuid, { data_pagamento: dataPagamento, version: pagarVenda.version }));
  }

  function rowMenuItems(row: PrepostoVenda): RowMenuItem[] {
    const items: RowMenuItem[] = [];
    if (row.status === 'pendente' && canAlterarPercentual) {
      items.push({
        label: 'Alterar %', icon: Percent,
        onSelect: () => { setFormError(null); setPercentual(String(Number(row.perc_comissao))); setPercentualVenda(row); },
      });
    }
    if (row.status === 'pendente' && canPagar) {
      items.push({
        label: 'Marcar como pago', icon: BadgeCheck, disabled: !(moneyForDisplay(row.valor_comissao) > 0),
        onSelect: () => { setFormError(null); setDataPagamento(hojeSaoPaulo()); setPagarVenda(row); },
      });
    }
    if (row.status === 'pago' && canPagar) {
      items.push({
        label: 'Estornar pagamento', icon: Undo2, danger: true,
        onSelect: () => { setFormError(null); setEstornarVenda(row); },
      });
    }
    return items;
  }

  const columns = [
    { key: 'data', header: 'Faturamento', cell: (row: PrepostoVenda) => formatDate(row.data_faturamento) },
    { key: 'nf', header: 'NF', cell: (row: PrepostoVenda) => row.numero_nfe ?? '—' },
    {
      key: 'pedido',
      header: 'Pedido',
      cell: (row: PrepostoVenda) => (
        <span>
          <span className='font-mono'>{row.pedido.numero_pedido != null ? `#${row.pedido.numero_pedido}` : '—'}</span>
          {row.pedido.cliente && <span className='block text-xs text-slate-500'>{row.pedido.cliente}</span>}
        </span>
      ),
    },
    { key: 'preposto', header: 'Preposto', cell: (row: PrepostoVenda) => row.preposto.nome },
    { key: 'valor', header: 'Valor da nota', cell: (row: PrepostoVenda) => BRL.format(moneyForDisplay(row.valor_faturado)) },
    { key: 'perc', header: '%', cell: (row: PrepostoVenda) => `${Number(row.perc_comissao).toLocaleString('pt-BR')}%` },
    { key: 'comissao', header: 'Comissão', cell: (row: PrepostoVenda) => <strong>{BRL.format(moneyForDisplay(row.valor_comissao))}</strong> },
    {
      key: 'status',
      header: 'Status',
      cell: (row: PrepostoVenda) => (
        row.status === 'pago'
          ? <span className='inline-flex rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800'>Pago em {formatDate(row.data_pagamento)}</span>
          : <span className='inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'>Pendente</span>
      ),
    },
    {
      key: 'acoes',
      header: 'Ações',
      cell: (row: PrepostoVenda) => (
        <RowMenu label={`Ações da NF ${row.numero_nfe ?? ''} de ${row.preposto.nome}`.replace(/\s+/g, ' ')} items={rowMenuItems(row)} />
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <label className='flex flex-col gap-1'>
          <span className={labelClass}>Preposto</span>
          <AsyncCombobox
            value={prepostoUuid}
            displayValue={prepostoLabel}
            onChange={(value, option) => { setPrepostoUuid(value); setPrepostoLabel(option?.label ?? ''); }}
            fetcher={prepostoFetcher}
            ariaLabel='Filtrar por preposto'
            placeholder='Todos os prepostos'
            className={inputClass}
          />
        </label>
        <label className='flex flex-col gap-1'>
          <span className={labelClass}>Status</span>
          <select aria-label='Filtrar por status' value={status} onChange={(e) => setStatus(e.target.value as StatusFiltro)} className={inputClass}>
            <option value=''>Todos</option>
            <option value='pendente'>Pendente</option>
            <option value='pago'>Pago</option>
          </select>
        </label>
        <label className='flex flex-col gap-1'>
          <span className={labelClass}>De</span>
          <input type='date' aria-label='Faturamento a partir de' value={inicio} onChange={(e) => setInicio(e.target.value)} className={inputClass} />
        </label>
        <label className='flex flex-col gap-1'>
          <span className={labelClass}>Até</span>
          <input type='date' aria-label='Faturamento até' value={fim} onChange={(e) => setFim(e.target.value)} className={inputClass} />
        </label>
      </div>
      {periodoInvertido && <p role='alert' className='text-sm text-red-700'>A data inicial não pode ser depois da final.</p>}

      {totais && (
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
          <div className='rounded-xl border border-slate-100 bg-white p-4 shadow-sm'>
            <p className={labelClass}>Vendido (notas)</p>
            <p className='mt-1 text-lg font-semibold text-slate-900'>{BRL.format(moneyForDisplay(totais.faturado))}</p>
          </div>
          <div className='rounded-xl border border-slate-100 bg-white p-4 shadow-sm'>
            <p className={labelClass}>Comissão a pagar</p>
            <p className='mt-1 text-lg font-semibold text-amber-700'>{BRL.format(moneyForDisplay(totais.comissao_pendente))}</p>
          </div>
          <div className='rounded-xl border border-slate-100 bg-white p-4 shadow-sm'>
            <p className={labelClass}>Comissão paga</p>
            <p className='mt-1 text-lg font-semibold text-teal-700'>{BRL.format(moneyForDisplay(totais.comissao_paga))}</p>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        error={error}
        onRetry={reload}
        meta={meta ?? undefined}
        onPageChange={goToPage}
        emptyTitle='Nenhuma venda de preposto'
        emptyDescription='Notas fiscais lançadas em pedidos com preposto aparecem aqui.'
      />

      {percentualVenda && (
        <Dialog open title={`Alterar % — NF ${percentualVenda.numero_nfe ?? ''}`} onClose={closeDialogs} className='max-w-sm'>
          <form onSubmit={handlePercentual} className='space-y-4'>
            {formError && <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>{formError}</div>}
            <p className='text-sm text-slate-600'>
              Valor da nota: <strong>{BRL.format(moneyForDisplay(percentualVenda.valor_faturado))}</strong>
            </p>
            <label className='flex flex-col gap-1'>
              <span className={labelClass}>% de comissão</span>
              <input type='number' step='0.01' min='0' max='100' required value={percentual} onChange={(e) => setPercentual(e.target.value)} className={inputClass} aria-label='Percentual de comissão' />
            </label>
            <div className='flex justify-end gap-3'>
              <button type='button' onClick={closeDialogs} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50'>Cancelar</button>
              <button type='submit' disabled={saving} className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60'>{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </form>
        </Dialog>
      )}

      {pagarVenda && (
        <Dialog open title='Marcar comissão como paga' onClose={closeDialogs} className='max-w-sm'>
          <form onSubmit={handlePagar} className='space-y-4'>
            {formError && <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>{formError}</div>}
            <p className='text-sm text-slate-600'>
              Lança uma saída de <strong>{BRL.format(moneyForDisplay(pagarVenda.valor_comissao))}</strong> no Financeiro
              para {pagarVenda.preposto.nome} (NF {pagarVenda.numero_nfe ?? 's/n'}).
            </p>
            <label className='flex flex-col gap-1'>
              <span className={labelClass}>Data do pagamento</span>
              <input type='date' required value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} className={inputClass} aria-label='Data do pagamento' />
            </label>
            <div className='flex justify-end gap-3'>
              <button type='button' onClick={closeDialogs} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50'>Cancelar</button>
              <button type='submit' disabled={saving} className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60'>{saving ? 'Salvando...' : 'Confirmar pagamento'}</button>
            </div>
          </form>
        </Dialog>
      )}

      {estornarVenda && (
        <Dialog open title='Estornar pagamento' onClose={closeDialogs} className='max-w-sm'>
          <div className='space-y-4'>
            {formError && <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>{formError}</div>}
            <p className='text-sm text-slate-700'>
              A comissão volta para pendente e a saída de {BRL.format(moneyForDisplay(estornarVenda.valor_comissao))} sai do Financeiro.
            </p>
            <div className='flex justify-end gap-3'>
              <button type='button' onClick={closeDialogs} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50'>Voltar</button>
              <button
                type='button'
                disabled={saving}
                onClick={() => { void run(() => registrarPagamentoVenda(estornarVenda.uuid, { data_pagamento: null, version: estornarVenda.version })); }}
                className='min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60'
              >
                {saving ? 'Estornando...' : 'Estornar'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
