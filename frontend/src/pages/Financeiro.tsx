import { cloneElement, useState, useEffect, useCallback, useId } from 'react';
import { Plus, Wallet, TrendingDown, BarChart2, Trash2, Package, User, Pin, RefreshCw, CheckCircle2 } from 'lucide-react';
import api from '@/lib/apiClient';
import { InputMoney } from '@/components/ui/InputMoney';
import Dialog from '@/components/ui/Dialog';
import DataTable from '@/components/tables/DataTable';
import { moneyForDisplay, moneyString, percentageOf, sumMoney } from '@/lib/decimal';
import { useAuth } from '@/hooks/useAuth';
import { useUuidDeCriacao } from '@/hooks/useUuidDeCriacao';
import { Can } from '@/components/Can';

// ─── Formatação ──────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Lancamento {
  uuid: string;
  version: number;
  tipo: string;
  descricao: string | null;
  valor: string;
  data: string | null;
}

interface Comissao {
  uuid: string;
  version: number;
  fornecedor_id: number | null;
  fornecedor?: { razao_social: string } | null;
  cliente?: { razao_social: string } | null;
  numero_pedido: string | null;
  numero_nfe: string | null;
  /** Presente quando a comissão nasceu do registro de uma nota fiscal (fluxo de faturamento). */
  nota_fiscal_id: number | null;
  data_pedido: string | null;
  data_faturamento: string | null;
  data_pagamento: string | null;
  valor_pedido: string | null;
  valor_faturado: string | null;
  perc_comissao: string | null;
  valor_comissao: string;
  status: string;
}

interface Parceiro {
  uuid: string;
  version: number;
  nome_parceiro: string;
  empresa_parceiro: string | null;
  fornecedor?: { razao_social: string } | null;
  cliente?: { razao_social: string } | null;
  numero_pedido: string | null;
  data_pedido: string;
  valor_faturado: string | null;
  percentual_comissao: string;
  valor_comissao: string;
  status: string;
}

interface Inadimplencia {
  uuid: string;
  version: number;
  cliente?: { razao_social: string } | null;
  empresa_devedora: string | null;
  valor_aberto: string | null;
  observacao: string | null;
}

interface Fornecedor {
  id: number;
  uuid: string;
  razao_social: string;
}

// ─── Helpers visuais ─────────────────────────────────────────────────────────

const now = new Date();

const inputCls =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 w-full';
const labelCls = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

function writeErrorMessage(error: unknown): string {
  const apiError = error as {
    response?: { status?: number; data?: { error?: { code?: string; message?: string } } };
  };
  if (apiError.response?.data?.error?.code === 'CONCURRENT_MODIFICATION') {
    return 'Registro alterado por outro usuário. Lista atualizada; revise antes de tentar novamente.';
  }
  return apiError.response?.data?.error?.message ?? 'Não foi possível concluir a operação.';
}

function WriteError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div role='alert' className='border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>{message}</div>;
}

function FiltroMesAno({
  mes, setMes, ano, setAno,
}: { mes: number; setMes: (m: number) => void; ano: number; setAno: (a: number) => void }) {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const anos = Array.from({ length: now.getFullYear() - 2024 + 1 }, (_, i) => 2024 + i);
  const sel =
    'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-primary';
  return (
    <div className='flex items-center gap-2'>
      <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={sel}>
        {meses.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className={sel}>
        {anos.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
    </div>
  );
}

function BtnPrimary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 transition-colors'
    >
      {children}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open title={title} onClose={onClose}>{children}</Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className='flex flex-col gap-1'>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}

function ModalBtns({ onClose, saving }: { onClose: () => void; saving: boolean }) {
  return (
    <div className='flex justify-end gap-3 pt-3'>
      <button type='button' onClick={onClose} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
        Cancelar
      </button>
      <button type='submit' disabled={saving} className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'>
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: 'bg-slate-100 text-slate-700',
    faturado: 'bg-primary-50 text-primary-700',
    pago: 'bg-teal-100 text-teal-700',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

// ─── Tab: Fluxo de Caixa ─────────────────────────────────────────────────────

function FluxoCaixa() {
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [data, setData] = useState<{ receitas: string; custos: string; saldo: string; lancamentos: Lancamento[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ tipo: string; descricao: string; valor: number | null; data: string }>({ tipo: 'Custo Fixo', descricao: '', valor: null, data: '' });
  const [saving, setSaving] = useState(false);
  // Identidade estável do lançamento em criação: o retry depois de um erro
  // reenvia o MESMO uuid, e o servidor devolve o registro já criado em vez de
  // criar um segundo. Renova só depois do sucesso.
  const { uuid: uuidDeCriacao, renovar: renovarUuidDeCriacao } = useUuidDeCriacao();
  const [error, setError] = useState<string | null>(null);

  const TIPO_COLORS: Record<string, string> = {
    'Custo Fixo': 'bg-red-100 text-red-700',
    'Custo Rotativo': 'bg-slate-100 text-slate-700',
    'Venda': 'bg-teal-100 text-teal-700',
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get(`/financeiro/fluxo-caixa?mes=${mes}&ano=${ano}`)
      .then((r) => {
        const d = (r.data as { data: typeof data }).data ?? r.data;
        setData(d as { receitas: string; custos: string; saldo: string; lancamentos: Lancamento[] });
      })
      .catch(() => { setData(null); setError('Não foi possível carregar o fluxo de caixa.'); })
      .finally(() => setLoading(false));
  }, [mes, ano]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/financeiro/lancamentos', {
        uuid: uuidDeCriacao,
        tipo: form.tipo,
        descricao: form.descricao || null,
        valor: moneyString(form.valor),
        data: form.data || null,
      });
      renovarUuidDeCriacao();
      setShowForm(false);
      setForm({ tipo: 'Custo Fixo', descricao: '', valor: null, data: '' });
      load();
    } catch (requestError) {
      setError(writeErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <FiltroMesAno mes={mes} setMes={setMes} ano={ano} setAno={setAno} />
        <Can permission='financeiro.editar'>
          <BtnPrimary onClick={() => setShowForm(true)}><Plus className='h-4 w-4' />Novo Lançamento</BtnPrimary>
        </Can>
      </div>
      <WriteError message={error} />

      {loading ? (
        <div className='text-sm text-slate-400 py-8 text-center'>Carregando...</div>
      ) : data ? (
        <>
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
            <div className='rounded-xl bg-white border border-slate-100 shadow-sm p-5'>
              <div className='flex items-center gap-2 mb-2'>
                <Wallet className='h-4 w-4 text-teal-500' />
                <span className='text-xs font-semibold uppercase tracking-wider text-slate-400'>Receitas</span>
              </div>
              <p className='text-2xl font-bold text-slate-900'>{BRL.format(moneyForDisplay(data.receitas))}</p>
              <p className='text-xs text-slate-400 mt-1'>Comissões faturadas no mês</p>
            </div>
            <div className='rounded-xl bg-white border border-slate-100 shadow-sm p-5'>
              <div className='flex items-center gap-2 mb-2'>
                <TrendingDown className='h-4 w-4 text-red-500' />
                <span className='text-xs font-semibold uppercase tracking-wider text-slate-400'>Custos</span>
              </div>
              <p className='text-2xl font-bold text-slate-900'>{BRL.format(moneyForDisplay(data.custos))}</p>
            </div>
            <div className='rounded-xl bg-white border border-slate-100 shadow-sm p-5'>
              <div className='flex items-center gap-2 mb-2'>
                <BarChart2 className={`h-4 w-4 ${moneyForDisplay(data.saldo) >= 0 ? 'text-teal-500' : 'text-red-500'}`} />
                <span className='text-xs font-semibold uppercase tracking-wider text-slate-400'>Saldo</span>
              </div>
              <p className={`text-2xl font-bold ${moneyForDisplay(data.saldo) >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                {BRL.format(moneyForDisplay(data.saldo))}
              </p>
            </div>
          </div>

          <div>
            <h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400'>Lançamentos do Mês</h3>
            <DataTable<Lancamento>
              columns={[
                {
                  key: 'tipo',
                  header: 'Tipo',
                  cell: (l) => (
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_COLORS[l.tipo] ?? 'bg-slate-100 text-slate-600'}`}>
                      {l.tipo}
                    </span>
                  ),
                },
                { key: 'descricao', header: 'Descrição', cell: (l) => <span className='text-slate-700'>{l.descricao ?? '—'}</span> },
                { key: 'data', header: 'Data', cell: (l) => <span className='text-slate-500'>{fmtDate(l.data)}</span> },
                {
                  key: 'valor',
                  header: 'Valor',
                  className: 'text-right',
                  cell: (l) => <span className='font-semibold text-slate-900'>{BRL.format(moneyForDisplay(l.valor))}</span>,
                },
              ]}
              data={data.lancamentos}
              emptyTitle='Nenhum lançamento no período'
              emptyDescription='Registre um lançamento para vê-lo listado aqui.'
            />
          </div>
        </>
      ) : (
        <div className='py-10 text-center text-sm text-slate-400'>Sem dados para o período</div>
      )}

      {showForm && (
        <Modal title='Novo Lançamento' onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <Field label='Tipo'>
              <select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} className={inputCls}>
                <option value='Custo Fixo'>Custo Fixo</option>
                <option value='Custo Rotativo'>Custo Rotativo</option>
              </select>
            </Field>
            <Field label='Descrição'>
              <input type='text' value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} className={inputCls} />
            </Field>
            <Field label='Valor (R$)'>
              <InputMoney value={form.valor} onChange={(val) => setForm((p) => ({ ...p, valor: val }))} required />
            </Field>
            <Field label='Data'>
              <input type='date' value={form.data} onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))} className={inputCls} />
            </Field>
            <ModalBtns onClose={() => setShowForm(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab: Empresas ────────────────────────────────────────────────────────────

/**
 * Lista de fornecedores para os filtros das abas do Financeiro.
 *
 * O template `financeiro` não tem `fornecedores.ver` — o fetch respondia 403 e
 * o `.catch(() => {})` deixava o filtro vazio, sem nada explicando por quê.
 * Agora nem sequer chamamos a API sem permissão, e a aba decide se monta o
 * filtro. Falha por outro motivo vira mensagem, como nos fetches vizinhos.
 */
function useFornecedoresFiltro() {
  const { hasPermission } = useAuth();
  const podeVer = hasPermission('fornecedores.ver');
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedoresError, setFornecedoresError] = useState<string | null>(null);

  useEffect(() => {
    if (!podeVer) return;
    api.get('/fornecedores?limit=100').then((r) => {
      setFornecedores((r.data as { data: Fornecedor[] }).data ?? r.data ?? []);
    }).catch(() => setFornecedoresError('Não foi possível carregar os fornecedores do filtro.'));
  }, [podeVer]);

  return { fornecedores, fornecedoresError, podeVerFornecedores: podeVer };
}

function Empresas() {
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [fornecedorId, setFornecedorId] = useState('');
  const { fornecedores, fornecedoresError, podeVerFornecedores } = useFornecedoresFiltro();
  const [grupos, setGrupos] = useState<{ fornecedor_id: number; razao_social: string; total_faturado: string; total_comissao: string; registros: Comissao[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
    if (fornecedorId) params.set('fornecedor_id', fornecedorId);
    api
      .get(`/financeiro/comissoes/por-empresa?${params.toString()}`)
      .then((r) => setGrupos((r.data as { data: typeof grupos }).data ?? r.data ?? []))
      .catch(() => { setGrupos([]); setError('Não foi possível carregar vendas por empresa.'); })
      .finally(() => setLoading(false));
  }, [mes, ano, fornecedorId]);

  useEffect(() => { load(); }, [load]);

  const sel = 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-primary';

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center gap-2'>
        <FiltroMesAno mes={mes} setMes={setMes} ano={ano} setAno={setAno} />
        {podeVerFornecedores && (
          <select
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
            aria-label='Filtrar por empresa'
            className={sel}
          >
            <option value=''>Todas as empresas</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
          </select>
        )}
      </div>
      <WriteError message={fornecedoresError} />
      <WriteError message={error} />
      {loading ? (
        <div className='py-8 text-center text-sm text-slate-400'>Carregando...</div>
      ) : grupos.length === 0 ? (
        <div className='py-10 text-center text-sm text-slate-400'>
          {fornecedorId ? 'Esta empresa não teve vendas no período' : 'Nenhuma venda registrada no período'}
        </div>
      ) : (
        grupos.map((g) => (
          <div key={g.fornecedor_id} className='space-y-2'>
            <div className='flex items-center justify-between'>
              <h3 className='flex items-center gap-2 font-semibold text-slate-900'>
                <Package className='h-4 w-4 text-slate-400' />
                {g.razao_social}
              </h3>
              <div className='text-sm font-medium text-slate-600'>
                Fat: {BRL.format(moneyForDisplay(g.total_faturado))} · Com: {BRL.format(moneyForDisplay(g.total_comissao))}
              </div>
            </div>
            <DataTable<Comissao>
              columns={[
                { key: 'data', header: 'Data', cell: (r) => <span className='text-slate-500'>{fmtDate(r.data_pedido)}</span> },
                { key: 'cliente', header: 'Cliente', cell: (r) => <span className='text-slate-700'>{r.cliente?.razao_social ?? '—'}</span> },
                {
                  key: 'valor_faturado',
                  header: 'Val. Fat.',
                  className: 'text-right',
                  cell: (r) => <span className='font-medium text-slate-900'>{BRL.format(moneyForDisplay(r.valor_faturado))}</span>,
                },
                {
                  key: 'perc',
                  header: '%',
                  className: 'text-right',
                  cell: (r) => <span className='text-slate-500'>{r.perc_comissao ?? '—'}%</span>,
                },
                {
                  key: 'comissao',
                  header: 'Comissão',
                  className: 'text-right',
                  cell: (r) => <span className='font-semibold text-teal-700'>{BRL.format(moneyForDisplay(r.valor_comissao))}</span>,
                },
                { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
              ]}
              data={g.registros}
              emptyTitle='Nenhuma venda registrada'
              emptyDescription='Este fornecedor não teve vendas no período selecionado.'
            />
          </div>
        ))
      )}
    </div>
  );
}

// ─── Tab: Comissão ────────────────────────────────────────────────────────────

function ComissaoAlune() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('financeiro.editar');

  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [status, setStatus] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [resumo, setResumo] = useState({ total: '0.00', faturado: '0.00', pendente: '0.00', pago: '0.00' });
  const { fornecedores, fornecedoresError, podeVerFornecedores } = useFornecedoresFiltro();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [percentualAlvo, setPercentualAlvo] = useState<Comissao | null>(null);
  const [percentualValor, setPercentualValor] = useState('');
  const [savingPercentual, setSavingPercentual] = useState(false);
  const [percentualError, setPercentualError] = useState<string | null>(null);

  const [pagamentoAlvo, setPagamentoAlvo] = useState<Comissao | null>(null);
  const [pagamentoData, setPagamentoData] = useState('');
  const [savingPagamento, setSavingPagamento] = useState(false);
  const [pagamentoError, setPagamentoError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ mes: String(mes), ano: String(ano), limit: '100' });
    if (status) params.set('status', status);
    if (fornecedorId) params.set('fornecedor_id', fornecedorId);

    Promise.all([
      api.get(`/financeiro/comissoes?${params}`),
      api.get(`/financeiro/comissoes/resumo?mes=${mes}&ano=${ano}`),
    ])
      .then(([r1, r2]) => {
        setComissoes((r1.data as { data: Comissao[] }).data ?? r1.data ?? []);
        setResumo((r2.data as { data: typeof resumo }).data ?? r2.data ?? { total: '0.00', faturado: '0.00', pendente: '0.00', pago: '0.00' });
      })
      .catch(() => setError('Não foi possível carregar comissões.'))
      .finally(() => setLoading(false));
  }, [mes, ano, status, fornecedorId]);

  useEffect(() => { load(); }, [load]);

  function openPercentualDialog(comissao: Comissao) {
    setPercentualAlvo(comissao);
    setPercentualValor(comissao.perc_comissao ?? '');
    setPercentualError(null);
  }

  async function handlePercentualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!percentualAlvo) return;
    if (percentualValor.trim() === '') {
      setPercentualError('Informe o percentual de comissão.');
      return;
    }
    setSavingPercentual(true);
    setPercentualError(null);
    try {
      await api.patch(`/financeiro/comissoes/${percentualAlvo.uuid}/percentual`, {
        perc_comissao: percentualValor,
        version: percentualAlvo.version,
      });
      setPercentualAlvo(null);
      load();
    } catch (requestError) {
      setPercentualError(writeErrorMessage(requestError));
    } finally {
      setSavingPercentual(false);
    }
  }

  function openPagamentoDialog(comissao: Comissao) {
    setPagamentoAlvo(comissao);
    setPagamentoData(comissao.data_pagamento ?? new Date().toISOString().slice(0, 10));
    setPagamentoError(null);
  }

  async function handlePagamentoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pagamentoAlvo) return;
    if (!pagamentoData) {
      setPagamentoError('Informe a data de pagamento.');
      return;
    }
    setSavingPagamento(true);
    setPagamentoError(null);
    try {
      await api.patch(`/financeiro/comissoes/${pagamentoAlvo.uuid}/pagamento`, {
        data_pagamento: pagamentoData,
        version: pagamentoAlvo.version,
      });
      setPagamentoAlvo(null);
      load();
    } catch (requestError) {
      setPagamentoError(writeErrorMessage(requestError));
    } finally {
      setSavingPagamento(false);
    }
  }

  const sel = 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-primary';

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <FiltroMesAno mes={mes} setMes={setMes} ano={ano} setAno={setAno} />
          {podeVerFornecedores && (
            <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} aria-label='Filtrar por fornecedor' className={sel}>
              <option value=''>Todos fornecedores</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
            </select>
          )}
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
            <option value=''>Todos status</option>
            <option value='pendente'>Pendente</option>
            <option value='faturado'>Faturado</option>
            <option value='pago'>Pago</option>
          </select>
        </div>
      </div>
      <WriteError message={fornecedoresError} />
      <WriteError message={error} />

      {/* Resumo */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        {[
          { label: 'Total', value: resumo.total, color: 'text-slate-900' },
          { label: 'Faturado', value: resumo.faturado, color: 'text-primary-700' },
          { label: 'Pendente', value: resumo.pendente, color: 'text-slate-700' },
          { label: 'Pago', value: resumo.pago, color: 'text-teal-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className='rounded-xl bg-white border border-slate-100 shadow-sm p-4'>
            <p className='text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1'>{label}</p>
            <p className={`text-xl font-bold ${color}`}>{BRL.format(moneyForDisplay(value))}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <DataTable<Comissao>
        columns={[
          {
            key: 'origem',
            header: 'Origem',
            cell: (c) =>
              c.nota_fiscal_id != null ? (
                <span className='inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600'>
                  Via nota{c.numero_pedido ? ` · Pedido #${c.numero_pedido}` : ''}
                </span>
              ) : (
                <span className='inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-400'>Manual</span>
              ),
          },
          { key: 'data_pedido', header: 'Data Ped.', cell: (c) => <span className='text-slate-500'>{fmtDate(c.data_pedido)}</span> },
          { key: 'fornecedor', header: 'Fornecedor', cell: (c) => <span className='text-slate-700'>{c.fornecedor?.razao_social ?? '—'}</span> },
          { key: 'nfe', header: 'NF-e', cell: (c) => <span className='text-slate-500'>{c.numero_nfe ?? '—'}</span> },
          {
            key: 'valor_faturado',
            header: 'Val. Fat.',
            className: 'text-right',
            cell: (c) => <span className='text-slate-900'>{BRL.format(moneyForDisplay(c.valor_faturado))}</span>,
          },
          {
            key: 'perc',
            header: '%',
            className: 'text-right',
            cell: (c) => <span className='text-slate-500'>{c.perc_comissao ?? '—'}%</span>,
          },
          {
            key: 'comissao',
            header: 'Comissão',
            className: 'text-right',
            cell: (c) => <span className='font-semibold text-teal-700'>{BRL.format(moneyForDisplay(c.valor_comissao))}</span>,
          },
          { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
          ...(canEdit
            ? [
                {
                  key: 'acoes',
                  header: 'Ações',
                  cell: (c: Comissao) => (
                    <>
                      {c.status === 'pendente' && (
                        <button type='button' onClick={() => openPercentualDialog(c)} className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'>
                          Informar percentual
                        </button>
                      )}
                      {c.status === 'faturado' && (
                        <button type='button' onClick={() => openPagamentoDialog(c)} className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'>
                          Registrar pagamento
                        </button>
                      )}
                      {c.status === 'pago' && c.data_pagamento && (
                        <span className='text-xs text-slate-500'>Pago em {fmtDate(c.data_pagamento)}</span>
                      )}
                    </>
                  ),
                },
              ]
            : []),
        ]}
        data={comissoes}
        isLoading={loading}
        emptyTitle='Nenhuma comissão no período'
        emptyDescription='Comissões aparecem aqui conforme pedidos são faturados ou lançados manualmente.'
      />

      {percentualAlvo && (
        <Modal title={`Informar percentual — ${percentualAlvo.fornecedor?.razao_social ?? 'comissão'}`} onClose={() => setPercentualAlvo(null)}>
          <form onSubmit={handlePercentualSubmit} className='space-y-4'>
            <WriteError message={percentualError} />
            <Field label='% Comissão'>
              <div className='relative'>
                <input
                  type='number'
                  aria-label='Percentual de comissão'
                  step='0.01'
                  min='0'
                  max='100'
                  required
                  value={percentualValor}
                  onChange={(e) => setPercentualValor(e.target.value)}
                  className={`${inputCls} pr-8`}
                />
                <span className='absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none'>%</span>
              </div>
            </Field>
            <ModalBtns onClose={() => setPercentualAlvo(null)} saving={savingPercentual} />
          </form>
        </Modal>
      )}

      {pagamentoAlvo && (
        <Modal title={`Registrar pagamento — ${pagamentoAlvo.fornecedor?.razao_social ?? 'comissão'}`} onClose={() => setPagamentoAlvo(null)}>
          <form onSubmit={handlePagamentoSubmit} className='space-y-4'>
            <WriteError message={pagamentoError} />
            <Field label='Data de pagamento'>
              <input type='date' required value={pagamentoData} onChange={(e) => setPagamentoData(e.target.value)} className={inputCls} />
            </Field>
            <ModalBtns onClose={() => setPagamentoAlvo(null)} saving={savingPagamento} />
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab: Parceiros ───────────────────────────────────────────────────────────

function Parceiros() {
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    nome_parceiro: string; empresa_parceiro: string; data_pedido: string;
    data_faturamento: string; valor_faturado: number | null; percentual_comissao: string;
    valor_comissao: number | null; status: string;
  }>({
    nome_parceiro: '', empresa_parceiro: '', data_pedido: '',
    data_faturamento: '', valor_faturado: null, percentual_comissao: '50',
    valor_comissao: null, status: 'pendente',
  });
  const [saving, setSaving] = useState(false);
  // Identidade estável do lançamento em criação: o retry depois de um erro
  // reenvia o MESMO uuid, e o servidor devolve o registro já criado em vez de
  // criar um segundo. Renova só depois do sucesso.
  const { uuid: uuidDeCriacao, renovar: renovarUuidDeCriacao } = useUuidDeCriacao();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get(`/financeiro/parceiros?mes=${mes}&ano=${ano}&limit=100`)
      .then((r) => setParceiros((r.data as { data: Parceiro[] }).data ?? r.data ?? []))
      .catch(() => { setParceiros([]); setError('Não foi possível carregar parceiros.'); })
      .finally(() => setLoading(false));
  }, [mes, ano]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/financeiro/parceiros', {
        uuid: uuidDeCriacao,
        nome_parceiro: form.nome_parceiro,
        empresa_parceiro: form.empresa_parceiro || null,
        data_pedido: form.data_pedido,
        data_faturamento: form.data_faturamento || null,
        valor_faturado: form.valor_faturado === null ? undefined : moneyString(form.valor_faturado),
        percentual_comissao: form.percentual_comissao || '50',
        valor_comissao: moneyString(form.valor_comissao),
        status: form.status,
      });
      renovarUuidDeCriacao();
      setShowForm(false);
      load();
    } catch (requestError) {
      setError(writeErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  const grupos = parceiros.reduce<Record<string, { nome: string; empresa: string | null; total: string; items: Parceiro[] }>>((acc, p) => {
    const key = p.nome_parceiro;
    if (!acc[key]) acc[key] = { nome: p.nome_parceiro, empresa: p.empresa_parceiro, total: '0.00', items: [] };
    acc[key].total = sumMoney([acc[key].total, p.valor_comissao]);
    acc[key].items.push(p);
    return acc;
  }, {});

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <FiltroMesAno mes={mes} setMes={setMes} ano={ano} setAno={setAno} />
        <Can permission='financeiro.editar'>
          <BtnPrimary onClick={() => setShowForm(true)}><Plus className='h-4 w-4' />Novo Lançamento</BtnPrimary>
        </Can>
      </div>
      <WriteError message={error} />

      {loading ? (
        <div className='py-8 text-center text-sm text-slate-400'>Carregando...</div>
      ) : Object.keys(grupos).length === 0 ? (
        <div className='py-10 text-center text-sm text-slate-400'>Nenhum parceiro no período</div>
      ) : (
        Object.values(grupos).map((g) => (
          <div key={g.nome} className='space-y-2'>
            <div className='flex items-center justify-between'>
              <h3 className='flex items-center gap-2 font-semibold text-slate-900'>
                <User className='h-4 w-4 text-slate-400' />
                {g.nome}
                {g.empresa && <span className='text-xs font-normal text-slate-400'>({g.empresa})</span>}
              </h3>
              <div className='text-sm font-medium text-teal-700'>Total: {BRL.format(moneyForDisplay(g.total))}</div>
            </div>
            <DataTable<Parceiro>
              columns={[
                { key: 'data', header: 'Data', cell: (p) => <span className='text-slate-500'>{fmtDate(p.data_pedido)}</span> },
                { key: 'cliente', header: 'Cliente', cell: (p) => <span className='text-slate-700'>{p.cliente?.razao_social ?? '—'}</span> },
                {
                  key: 'valor_faturado',
                  header: 'Val. Fat.',
                  className: 'text-right',
                  cell: (p) => <span className='text-slate-900'>{BRL.format(moneyForDisplay(p.valor_faturado))}</span>,
                },
                {
                  key: 'perc',
                  header: '%',
                  className: 'text-right',
                  cell: (p) => <span className='text-slate-500'>{p.percentual_comissao}%</span>,
                },
                {
                  key: 'sua_parte',
                  header: 'Sua Parte',
                  className: 'text-right',
                  cell: (p) => <span className='font-semibold text-teal-700'>{BRL.format(moneyForDisplay(p.valor_comissao))}</span>,
                },
                { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
              ]}
              data={g.items}
              emptyTitle='Nenhum lançamento'
              emptyDescription='Este parceiro não tem lançamentos no período selecionado.'
            />
          </div>
        ))
      )}

      {showForm && (
        <Modal title='Novo Lançamento — Parceiro' onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
              <Field label='Nome do Parceiro'>
                <input type='text' required value={form.nome_parceiro} onChange={(e) => setForm((p) => ({ ...p, nome_parceiro: e.target.value }))} className={inputCls} />
              </Field>
              <Field label='Empresa do Parceiro'>
                <input type='text' value={form.empresa_parceiro} onChange={(e) => setForm((p) => ({ ...p, empresa_parceiro: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <Field label='Data do Pedido'>
                <input type='date' required value={form.data_pedido} onChange={(e) => setForm((p) => ({ ...p, data_pedido: e.target.value }))} className={inputCls} />
              </Field>
              <Field label='Data de Faturamento'>
                <input type='date' value={form.data_faturamento} onChange={(e) => setForm((p) => ({ ...p, data_faturamento: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <Field label='Valor Faturado'>
                <InputMoney value={form.valor_faturado} onChange={(val) => {
                  const vc = val !== null
                    ? moneyForDisplay(percentageOf(val, form.percentual_comissao || '50'))
                    : null;
                  setForm((p) => ({ ...p, valor_faturado: val, valor_comissao: vc }));
                }} />
              </Field>
              <Field label='% Comissão'>
                <div className='relative'>
                  <input type='number' aria-label='Percentual de comissão' step='0.01' min='0' max='100' value={form.percentual_comissao}
                    onChange={(e) => {
                      const pc = e.target.value;
                      const vc = form.valor_faturado !== null && pc !== ''
                        ? moneyForDisplay(percentageOf(form.valor_faturado, pc))
                        : null;
                      setForm((p) => ({ ...p, percentual_comissao: pc, valor_comissao: vc }));
                    }} className={`${inputCls} pr-8`} />
                  <span className='absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none'>%</span>
                </div>
              </Field>
            </div>
            <Field label='Valor Comissão'>
              <InputMoney value={form.valor_comissao} onChange={(val) => setForm((p) => ({ ...p, valor_comissao: val }))} required />
            </Field>
            <Field label='Status'>
              <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className={inputCls}>
                <option value='pendente'>Pendente</option>
                <option value='faturado'>Faturado</option>
                <option value='pago'>Pago</option>
              </select>
            </Field>
            <ModalBtns onClose={() => setShowForm(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab: Custos ─────────────────────────────────────────────────────────────

function Custos() {
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [fixos, setFixos] = useState<Lancamento[]>([]);
  const [rotativos, setRotativos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ tipo: string; descricao: string; valor: number | null; data: string }>({ tipo: 'Custo Fixo', descricao: '', valor: null, data: '' });
  const [saving, setSaving] = useState(false);
  // Identidade estável do lançamento em criação: o retry depois de um erro
  // reenvia o MESMO uuid, e o servidor devolve o registro já criado em vez de
  // criar um segundo. Renova só depois do sucesso.
  const { uuid: uuidDeCriacao, renovar: renovarUuidDeCriacao } = useUuidDeCriacao();
  const [writeError, setWriteError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get(`/financeiro/lancamentos?tipo=Custo%20Fixo&mes=${mes}&ano=${ano}&limit=100`),
      api.get(`/financeiro/lancamentos?tipo=Custo%20Rotativo&mes=${mes}&ano=${ano}&limit=100`),
    ])
      .then(([r1, r2]) => {
        setFixos((r1.data as { data: Lancamento[] }).data ?? r1.data ?? []);
        setRotativos((r2.data as { data: Lancamento[] }).data ?? r2.data ?? []);
      })
      .catch(() => setWriteError('Não foi possível carregar os custos.'))
      .finally(() => setLoading(false));
  }, [mes, ano]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setWriteError(null);
    try {
      await api.post('/financeiro/lancamentos', {
        uuid: uuidDeCriacao,
        tipo: form.tipo,
        descricao: form.descricao || null,
        valor: moneyString(form.valor),
        data: form.data || null,
      });
      renovarUuidDeCriacao();
      setShowForm(false);
      load();
    } catch (requestError) {
      setWriteError(writeErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(uuid: string, version: number) {
    if (!confirm('Remover este custo?')) return;
    setWriteError(null);
    try {
      await api.delete(`/financeiro/lancamentos/${uuid}`, { params: { version } });
    } catch (error) {
      setWriteError(writeErrorMessage(error));
    } finally {
      load();
    }
  }

  const totalFixo = sumMoney(fixos.map((l) => l.valor));
  const totalRotativo = sumMoney(rotativos.map((l) => l.valor));

  function CustoTable({ items, emptyDescription }: { items: Lancamento[]; emptyDescription: string }) {
    return (
      <DataTable<Lancamento>
        columns={[
          { key: 'descricao', header: 'Descrição', cell: (l) => <span className='text-slate-700'>{l.descricao ?? '—'}</span> },
          { key: 'data', header: 'Data', cell: (l) => <span className='text-slate-500'>{fmtDate(l.data)}</span> },
          {
            key: 'valor',
            header: 'Valor',
            className: 'text-right',
            cell: (l) => <span className='font-semibold text-slate-900'>{BRL.format(moneyForDisplay(l.valor))}</span>,
          },
          {
            key: 'acoes',
            header: '',
            className: 'w-10 text-right',
            cell: (l) => (
              <button aria-label={`Remover custo ${l.descricao ?? ''}`} onClick={() => handleDelete(l.uuid, l.version)} className='inline-flex h-11 w-11 items-center justify-center rounded text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'>
                <Trash2 className='h-4 w-4' />
              </button>
            ),
          },
        ]}
        data={items}
        emptyTitle='Nenhum custo cadastrado'
        emptyDescription={emptyDescription}
      />
    );
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <FiltroMesAno mes={mes} setMes={setMes} ano={ano} setAno={setAno} />
        <Can permission='financeiro.editar'>
          <BtnPrimary onClick={() => setShowForm(true)}><Plus className='h-4 w-4' />Novo Custo</BtnPrimary>
        </Can>
      </div>

      <WriteError message={writeError} />

      {loading ? (
        <div className='py-8 text-center text-sm text-slate-400'>Carregando...</div>
      ) : (
        <>
          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <h3 className='flex items-center gap-2 font-semibold text-slate-900'>
                <Pin className='h-4 w-4 text-slate-400' />
                Custo Fixo
              </h3>
              <span className='text-sm font-medium text-red-600'>Total: {BRL.format(moneyForDisplay(totalFixo))}</span>
            </div>
            <CustoTable items={fixos} emptyDescription='Nenhum custo fixo cadastrado.' />
          </div>

          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <h3 className='flex items-center gap-2 font-semibold text-slate-900'>
                <RefreshCw className='h-4 w-4 text-slate-400' />
                Custo Rotativo
              </h3>
              <span className='text-sm font-medium text-orange-600'>Total: {BRL.format(moneyForDisplay(totalRotativo))}</span>
            </div>
            <CustoTable items={rotativos} emptyDescription='Nenhum custo rotativo no mês.' />
          </div>

          <div className='rounded-xl bg-slate-50 border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700'>
            Total Custos do Mês: <span className='font-bold text-red-600'>{BRL.format(moneyForDisplay(sumMoney([totalFixo, totalRotativo])))}</span>
            <span className='ml-2 text-xs text-slate-400'>(alimenta Fluxo de Caixa)</span>
          </div>
        </>
      )}

      {showForm && (
        <Modal title='Novo Custo' onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <Field label='Tipo'>
              <select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} className={inputCls}>
                <option value='Custo Fixo'>Custo Fixo</option>
                <option value='Custo Rotativo'>Custo Rotativo</option>
              </select>
            </Field>
            <Field label='Descrição'>
              <input type='text' required value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} className={inputCls} />
            </Field>
            <Field label='Valor (R$)'>
              <InputMoney value={form.valor} onChange={(val) => setForm((p) => ({ ...p, valor: val }))} required />
            </Field>
            <Field label='Data'>
              <input type='date' value={form.data} onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))} className={inputCls} />
            </Field>
            <ModalBtns onClose={() => setShowForm(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab: Inadimplência ───────────────────────────────────────────────────────

function InadimplenciaTab() {
  const [items, setItems] = useState<Inadimplencia[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ empresa_devedora: string; valor_aberto: number | null; observacao: string }>({ empresa_devedora: '', valor_aberto: null, observacao: '' });
  const [saving, setSaving] = useState(false);
  // Identidade estável do lançamento em criação: o retry depois de um erro
  // reenvia o MESMO uuid, e o servidor devolve o registro já criado em vez de
  // criar um segundo. Renova só depois do sucesso.
  const { uuid: uuidDeCriacao, renovar: renovarUuidDeCriacao } = useUuidDeCriacao();
  const [writeError, setWriteError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setWriteError(null);
    api.get('/financeiro/inadimplencia?limit=100')
      .then((r) => setItems((r.data as { data: Inadimplencia[] }).data ?? r.data ?? []))
      .catch(() => { setItems([]); setWriteError('Não foi possível carregar a inadimplência.'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setWriteError(null);
    try {
      await api.post('/financeiro/inadimplencia', {
        uuid: uuidDeCriacao,
        empresa_devedora: form.empresa_devedora,
        valor_aberto: moneyString(form.valor_aberto),
        observacao: form.observacao || null,
      });
      renovarUuidDeCriacao();
      setShowForm(false);
      setForm({ empresa_devedora: '', valor_aberto: null, observacao: '' });
      load();
    } catch (requestError) {
      setWriteError(writeErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(uuid: string, version: number) {
    if (!confirm('Remover este registro?')) return;
    setWriteError(null);
    try {
      await api.delete(`/financeiro/inadimplencia/${uuid}`, { params: { version } });
    } catch (error) {
      setWriteError(writeErrorMessage(error));
    } finally {
      load();
    }
  }

  const total = sumMoney(items.map((i) => i.valor_aberto));

  return (
    <div className='space-y-5'>
      <div className='flex items-center justify-between'>
        {items.length > 0 && (
          <span className='text-sm font-medium text-red-600'>
            Total em aberto: {BRL.format(moneyForDisplay(total))}
          </span>
        )}
        <div className='ml-auto'>
          <BtnPrimary onClick={() => setShowForm(true)}><Plus className='h-4 w-4' />Registrar</BtnPrimary>
        </div>
      </div>

      <WriteError message={writeError} />

      {loading ? (
        <div className='py-8 text-center text-sm text-slate-400'>Carregando...</div>
      ) : items.length === 0 ? (
        <div className='rounded-xl bg-white border border-slate-100 shadow-sm py-14 text-center'>
          <CheckCircle2 className='mx-auto mb-3 h-8 w-8 text-teal-500' />
          <p className='text-slate-600 font-medium'>Nenhum registro de inadimplência. Parabéns!</p>
        </div>
      ) : (
        <DataTable<Inadimplencia>
          columns={[
            { key: 'cliente', header: 'Cliente', cell: (i) => <span className='text-slate-700'>{i.cliente?.razao_social ?? '—'}</span> },
            { key: 'empresa', header: 'Empresa Devedora', cell: (i) => <span className='text-slate-700'>{i.empresa_devedora ?? '—'}</span> },
            {
              key: 'valor',
              header: 'Valor Aberto',
              className: 'text-right',
              cell: (i) => <span className='font-semibold text-red-600'>{BRL.format(moneyForDisplay(i.valor_aberto))}</span>,
            },
            {
              key: 'observacao',
              header: 'Observação',
              className: 'max-w-xs truncate',
              cell: (i) => <span className='text-slate-500'>{i.observacao ?? '—'}</span>,
            },
            {
              key: 'acoes',
              header: '',
              className: 'w-10 text-right',
              cell: (i) => (
                <button aria-label={`Remover inadimplência de ${i.empresa_devedora ?? 'cliente'}`} onClick={() => handleDelete(i.uuid, i.version)} className='inline-flex h-11 w-11 items-center justify-center rounded text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'>
                  <Trash2 className='h-4 w-4' />
                </button>
              ),
            },
          ]}
          data={items}
        />
      )}

      {showForm && (
        <Modal title='Registrar Inadimplência' onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <Field label='Empresa Devedora'>
              <input type='text' required value={form.empresa_devedora} onChange={(e) => setForm((p) => ({ ...p, empresa_devedora: e.target.value }))} className={inputCls} />
            </Field>
            <Field label='Valor em Aberto (R$)'>
              <InputMoney value={form.valor_aberto} onChange={(val) => setForm((p) => ({ ...p, valor_aberto: val }))} required />
            </Field>
            <Field label='Observação'>
              <textarea value={form.observacao} onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))} rows={3} className={`${inputCls} resize-none`} />
            </Field>
            <ModalBtns onClose={() => setShowForm(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

type Tab = 'fluxo-caixa' | 'empresas' | 'parceiros' | 'comissao' | 'custos' | 'inadimplencia';

const TABS: { id: Tab; label: string }[] = [
  { id: 'fluxo-caixa', label: 'Fluxo de Caixa' },
  { id: 'empresas', label: 'Empresas' },
  { id: 'parceiros', label: 'Parceiros' },
  { id: 'comissao', label: 'Comissão' },
  { id: 'custos', label: 'Custos' },
  { id: 'inadimplencia', label: 'Inadimplência' },
];

export default function Financeiro() {
  const [tab, setTab] = useState<Tab>('fluxo-caixa');

  return (
    <div className='space-y-5'>
      {/* Tabs navigation */}
      <div className='flex overflow-x-auto border-b border-slate-200'>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da tab ativa */}
      {tab === 'fluxo-caixa' && <FluxoCaixa />}
      {tab === 'empresas' && <Empresas />}
      {tab === 'parceiros' && <Parceiros />}
      {tab === 'comissao' && <ComissaoAlune />}
      {tab === 'custos' && <Custos />}
      {tab === 'inadimplencia' && <InadimplenciaTab />}
    </div>
  );
}
