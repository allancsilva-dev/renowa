import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FileDown, FileText, Pencil, XCircle } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import { RowMenu, type RowMenuItem } from '@/components/tables/RowMenu';
import Dialog from '@/components/ui/Dialog';
import { InputMoney } from '@/components/ui/InputMoney';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/hooks/useAuth';
import { useUuidDeCriacao } from '@/hooks/useUuidDeCriacao';
import { ajustarValorPedido, fetchFaturamentoPedidos, registrarNota, type FaturamentoPedidoRow } from '@/services/faturamento.service';
import { updateOrderStatus } from '@/services/orders.service';
import { useOrderPdf } from '@/hooks/useOrderPdf';
import { canCancelarPedido } from '@/lib/orderPermissions';
import { moneyForDisplay, normalizeMoney } from '@/lib/decimal';
import { getApiErrorMessage } from '@/lib/errors';
import { orderStatusLabel, orderStatusColor, orderOrigemLabel, orderOrigemColor, type OrderStatus } from '@/types';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

type NotaForm = { numero_nota: string; serie: string; valor: number | null; perc_comissao: string; data_emissao: string; observacao: string };
const EMPTY_NOTA_FORM: NotaForm = { numero_nota: '', serie: '', valor: null, perc_comissao: '5', data_emissao: '', observacao: '' };

function pedidoLabel(row: Pick<FaturamentoPedidoRow, 'numero_pedido'>): string {
  return row.numero_pedido != null ? `#${row.numero_pedido}` : '';
}

export default function Faturamento() {
  const navigate = useNavigate();
  const { hasPermission, hasAnyRole } = useAuth();
  const canEdit = hasPermission('faturamento.editar');
  // Ajuste de valor é do ADMIN por decisão do negócio; Gestão tem a mesma
  // permissão e não deve nem ver a opção. O backend repete a regra (403).
  const canAjustarValor = canEdit && hasAnyRole(['ADMIN']);
  const { generate: gerarPdf, loadingUuid: pdfLoadingUuid, error: pdfError, warning: pdfWarning } = useOrderPdf();

  const [ajustePedido, setAjustePedido] = useState<FaturamentoPedidoRow | null>(null);
  const [ajusteValor, setAjusteValor] = useState<number | null>(null);
  const [ajusteMotivo, setAjusteMotivo] = useState('');
  const [cancelPedido, setCancelPedido] = useState<FaturamentoPedidoRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [notaPedido, setNotaPedido] = useState<FaturamentoPedidoRow | null>(null);
  const [notaForm, setNotaForm] = useState<NotaForm>(EMPTY_NOTA_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Nota fiscal duplicada por retry é dinheiro contado duas vezes: a identidade
  // renova na abertura do diálogo e sobrevive a quantas tentativas forem.
  const { uuid: uuidDaNota, renovar: renovarUuidDaNota } = useUuidDeCriacao();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());

  const fetcher = useCallback(
    (params: { page: number; limit: number }) => fetchFaturamentoPedidos({ ...params, search: debouncedSearch || undefined }),
    [debouncedSearch],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<FaturamentoPedidoRow>({ fetcher });

  function openNotaDialog(row: FaturamentoPedidoRow) {
    renovarUuidDaNota();
    setNotaPedido(row);
    setNotaForm(EMPTY_NOTA_FORM);
    setFormError(null);
  }

  function openAjusteDialog(row: FaturamentoPedidoRow) {
    setAjustePedido(row);
    setAjusteValor(moneyForDisplay(row.valor));
    setAjusteMotivo('');
    setFormError(null);
  }

  async function handleSubmitAjuste(event: React.FormEvent) {
    event.preventDefault();
    if (!ajustePedido || saving) return;
    const motivo = ajusteMotivo.trim();
    if (ajusteValor === null || ajusteValor <= 0) { setFormError('Informe um valor maior que zero.'); return; }
    if (moneyForDisplay(normalizeMoney(ajusteValor)) < moneyForDisplay(ajustePedido.total_faturado)) {
      setFormError('O valor não pode ficar abaixo do total já faturado.');
      return;
    }
    if (motivo.length < 3) { setFormError('Informe o motivo do ajuste (mínimo 3 caracteres).'); return; }
    setSaving(true);
    setFormError(null);
    try {
      await ajustarValorPedido(ajustePedido.uuid, { valor: normalizeMoney(ajusteValor), motivo, version: ajustePedido.version });
      setAjustePedido(null);
      reload();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelPedido || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      await updateOrderStatus(cancelPedido.uuid, 'cancelado', cancelPedido.version);
      setCancelPedido(null);
      reload();
    } catch (err) {
      // 409 (nota registrada no meio) ou versão obsoleta: fecha, avisa e
      // recarrega para a linha refletir o estado real.
      setCancelPedido(null);
      setActionError(getApiErrorMessage(err));
      reload();
    } finally {
      setSaving(false);
    }
  }

  function rowMenuItems(row: FaturamentoPedidoRow): RowMenuItem[] {
    const items: RowMenuItem[] = [
      { label: 'Ver detalhes', icon: Eye, onSelect: () => navigate(`/faturamento/${row.uuid}`) },
    ];
    if (canEdit) items.push({ label: 'Registrar nota', icon: FileText, onSelect: () => openNotaDialog(row) });
    items.push({
      label: pdfLoadingUuid === row.uuid ? 'Gerando PDF...' : 'Ver PDF',
      icon: FileDown,
      disabled: pdfLoadingUuid !== null,
      onSelect: () => { setActionError(null); void gerarPdf(row.uuid); },
    });
    if (canAjustarValor) items.push({ label: 'Editar valor', icon: Pencil, onSelect: () => openAjusteDialog(row) });
    // Mesma regra do detalhe do pedido: só sem nota registrada (status liberado).
    if (canCancelarPedido(hasPermission, row.status as OrderStatus)) {
      items.push({ label: 'Cancelar pedido', icon: XCircle, danger: true, onSelect: () => { setActionError(null); setCancelPedido(row); } });
    }
    return items;
  }

  async function handleSubmitNota(event: React.FormEvent) {
    event.preventDefault();
    if (!notaPedido) return;
    const percentualComissao = Number(notaForm.perc_comissao);
    if (!notaForm.numero_nota.trim() || notaForm.valor === null || notaForm.perc_comissao.trim() === '') {
      setFormError('Informe o número da nota, o valor e o percentual de comissão.');
      return;
    }
    if (!Number.isFinite(percentualComissao) || percentualComissao < 0 || percentualComissao > 100) {
      setFormError('Percentual de comissão deve estar entre 0 e 100.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await registrarNota(notaPedido.uuid, {
        uuid: uuidDaNota,
        numero_nota: notaForm.numero_nota.trim(),
        serie: notaForm.serie.trim() || undefined,
        valor: normalizeMoney(notaForm.valor),
        perc_comissao: percentualComissao,
        data_emissao: notaForm.data_emissao || undefined,
        observacao: notaForm.observacao.trim() || undefined,
      });
      setNotaPedido(null);
      reload();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      key: 'numero',
      header: 'Nº Pedido',
      cell: (row: FaturamentoPedidoRow) => (
        <span className='font-mono font-medium'>{row.numero_pedido != null ? `#${row.numero_pedido}` : '—'}</span>
      ),
    },
    {
      key: 'origem',
      header: 'Origem',
      // Em pedido externo o valor é declarado, não somado dos itens: a divergência
      // contra a nota tem outro significado, e quem confere precisa saber disso.
      cell: (row: FaturamentoPedidoRow) => {
        const origem = row.origem ?? 'interno';
        return (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${orderOrigemColor[origem] ?? 'bg-slate-100 text-slate-600'}`}
            title={origem === 'externo' && row.numero_pedido_externo ? `Nº de origem ${row.numero_pedido_externo}` : undefined}
          >
            {origem === 'externo' && row.sistema_origem ? row.sistema_origem : orderOrigemLabel[origem] ?? origem}
          </span>
        );
      },
    },
    { key: 'cliente', header: 'Cliente', cell: (row: FaturamentoPedidoRow) => row.cliente ?? '—' },
    { key: 'fornecedor', header: 'Fornecedor', cell: (row: FaturamentoPedidoRow) => row.fornecedor ?? '—' },
    {
      key: 'valor',
      header: 'Valor',
      cell: (row: FaturamentoPedidoRow) => (
        row.valor_ajustado
          ? (
            <span title={`Valor original ${BRL.format(moneyForDisplay(row.valor_original))}`}>
              {BRL.format(moneyForDisplay(row.valor))}
              <span className='ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold uppercase text-amber-800'>Ajustado</span>
            </span>
          )
          : BRL.format(moneyForDisplay(row.valor))
      ),
    },
    {
      key: 'total_faturado',
      header: 'Total Faturado',
      cell: (row: FaturamentoPedidoRow) => BRL.format(moneyForDisplay(row.total_faturado)),
    },
    {
      key: 'divergencia',
      header: 'Divergência',
      cell: (row: FaturamentoPedidoRow) => {
        const value = moneyForDisplay(row.divergencia);
        return <span className={value === 0 ? 'text-slate-600' : value > 0 ? 'text-slate-800 font-semibold' : 'text-red-600 font-medium'}>{BRL.format(value)}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: FaturamentoPedidoRow) => {
        const status = row.status as OrderStatus;
        return (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusColor[status] ?? 'bg-slate-100 text-slate-600'}`}>
            {orderStatusLabel[status] ?? row.status}
          </span>
        );
      },
    },
    {
      key: 'acoes',
      header: 'Ações',
      cell: (row: FaturamentoPedidoRow) => (
        <RowMenu label={`Ações do pedido ${pedidoLabel(row)}`.trim()} items={rowMenuItems(row)} />
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-xl font-bold text-slate-900'>Faturamento</h1>
        <p className='text-sm text-slate-500 mt-1'>Pedidos liberados aguardando ou em processo de faturamento.</p>
      </div>

      {(actionError ?? pdfError) && (
        <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
          {actionError ?? pdfError}
        </div>
      )}
      {pdfWarning && (
        <div role='status' className='rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700'>
          {pdfWarning}
        </div>
      )}

      <input
        type='search'
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder='Nº pedido, CNPJ ou razão social'
        aria-label='Buscar pedidos a faturar'
        className='min-h-11 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        error={error}
        onRetry={reload}
        meta={meta ?? undefined}
        onPageChange={goToPage}
        emptyTitle={debouncedSearch ? 'Nenhum pedido encontrado para a busca' : 'Nenhum pedido para faturar'}
        emptyDescription={debouncedSearch ? 'Confira o número do pedido, o CNPJ ou a razão social.' : 'Pedidos liberados aparecem aqui para registro de notas fiscais.'}
      />

      {notaPedido && (
        <Dialog
          open
          title={`Registrar nota — Pedido ${notaPedido.numero_pedido != null ? `#${notaPedido.numero_pedido}` : ''}`}
          onClose={() => setNotaPedido(null)}
          className='max-w-md'
        >
          <form onSubmit={handleSubmitNota} className='space-y-4'>
            {formError && (
              <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
                {formError}
              </div>
            )}
            <div className='grid grid-cols-2 gap-3'>
              <div className='flex flex-col gap-1'>
                <label htmlFor='numero_nota' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                  Número da nota <span className='text-red-500'>*</span>
                </label>
                <input
                  id='numero_nota'
                  required
                  value={notaForm.numero_nota}
                  onChange={(e) => setNotaForm((p) => ({ ...p, numero_nota: e.target.value }))}
                  className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
                />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='serie' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Série</label>
                <input
                  id='serie'
                  value={notaForm.serie}
                  onChange={(e) => setNotaForm((p) => ({ ...p, serie: e.target.value }))}
                  className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
                />
              </div>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='flex flex-col gap-1'>
                <label htmlFor='valor' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                  Valor <span className='text-red-500'>*</span>
                </label>
                <InputMoney id='valor' value={notaForm.valor} onChange={(v) => setNotaForm((p) => ({ ...p, valor: v }))} required />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='data_emissao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Data de emissão</label>
                <input
                  id='data_emissao'
                  type='date'
                  value={notaForm.data_emissao}
                  onChange={(e) => setNotaForm((p) => ({ ...p, data_emissao: e.target.value }))}
                  className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
                />
              </div>
            </div>
            <div className='flex flex-col gap-1'>
              <label htmlFor='perc_comissao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                % Comissão <span className='text-red-500'>*</span>
              </label>
              <div className='relative'>
                <input
                  id='perc_comissao'
                  type='number'
                  step='0.01'
                  min='0'
                  max='100'
                  required
                  value={notaForm.perc_comissao}
                  onChange={(e) => setNotaForm((p) => ({ ...p, perc_comissao: e.target.value }))}
                  className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
                />
                <span className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400'>%</span>
              </div>
            </div>
            <div className='flex flex-col gap-1'>
              <label htmlFor='observacao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Observação</label>
              <textarea
                id='observacao'
                rows={3}
                value={notaForm.observacao}
                onChange={(e) => setNotaForm((p) => ({ ...p, observacao: e.target.value }))}
                className='resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
            </div>
            <div className='flex justify-end gap-3 pt-2'>
              <button type='button' onClick={() => setNotaPedido(null)} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
                Cancelar
              </button>
              <button type='submit' disabled={saving} className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'>
                {saving ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {ajustePedido && (
        <Dialog open title={`Editar valor — Pedido ${pedidoLabel(ajustePedido)}`} onClose={() => setAjustePedido(null)} className='max-w-md'>
          <form onSubmit={handleSubmitAjuste} className='space-y-4'>
            {formError && (
              <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>{formError}</div>
            )}
            <p className='text-sm text-slate-600'>
              Valor calculado: <strong>{BRL.format(moneyForDisplay(ajustePedido.valor_original))}</strong>
              {' · '}Já faturado: <strong>{BRL.format(moneyForDisplay(ajustePedido.total_faturado))}</strong>.
              Itens e papel do pedido não mudam.
            </p>
            <div className='flex flex-col gap-1'>
              <label htmlFor='ajuste_valor' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Novo valor <span className='text-red-500'>*</span>
              </label>
              <InputMoney id='ajuste_valor' value={ajusteValor} onChange={setAjusteValor} required />
            </div>
            <div className='flex flex-col gap-1'>
              <label htmlFor='ajuste_motivo' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Motivo <span className='text-red-500'>*</span>
              </label>
              <textarea
                id='ajuste_motivo'
                rows={3}
                required
                maxLength={500}
                value={ajusteMotivo}
                onChange={(e) => setAjusteMotivo(e.target.value)}
                className='resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
            </div>
            <div className='flex justify-end gap-3 pt-2'>
              <button type='button' onClick={() => setAjustePedido(null)} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
                Cancelar
              </button>
              <button type='submit' disabled={saving} className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'>
                {saving ? 'Salvando...' : 'Salvar valor'}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {cancelPedido && (
        <Dialog open title={`Cancelar pedido ${pedidoLabel(cancelPedido)}`} onClose={() => setCancelPedido(null)} className='max-w-md'>
          <div className='space-y-4'>
            <p className='text-sm text-slate-700'>O pedido sai do faturamento e fica cancelado. Essa ação não pode ser desfeita.</p>
            <div className='flex justify-end gap-3'>
              <button type='button' onClick={() => setCancelPedido(null)} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
                Voltar
              </button>
              <button type='button' onClick={handleConfirmCancel} disabled={saving} className='min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors'>
                {saving ? 'Cancelando...' : 'Cancelar pedido'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
