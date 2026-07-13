import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Wallet, TrendingDown, BarChart2, Trash2 } from 'lucide-react';
import api from '@/lib/apiClient';
import { InputMoney } from '@/components/ui/InputMoney';
import { moneyForDisplay, moneyString, percentageOf, sumMoney } from '@/lib/decimal';

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
  data_pedido: string | null;
  data_faturamento: string | null;
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
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2A9D8F] focus:ring-1 focus:ring-[#2A9D8F]/40 w-full';
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
    'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-[#2A9D8F]';
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
      className='flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity'
      style={{ backgroundColor: '#2A9D8F' }}
    >
      {children}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center'>
      <div className='absolute inset-0 bg-black/40' onClick={onClose} />
      <div className='relative z-10 w-full max-w-lg rounded-xl bg-white shadow-xl p-6 max-h-[90vh] overflow-y-auto'>
        <div className='flex items-center justify-between mb-5'>
          <h2 className='text-base font-bold text-slate-900'>{title}</h2>
          <button onClick={onClose} className='rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors'>
            <X className='h-5 w-5' />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-1'>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function ModalBtns({ onClose, saving }: { onClose: () => void; saving: boolean }) {
  return (
    <div className='flex justify-end gap-3 pt-3'>
      <button type='button' onClick={onClose} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
        Cancelar
      </button>
      <button type='submit' disabled={saving} className='rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity' style={{ backgroundColor: '#2A9D8F' }}>
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: 'bg-orange-100 text-orange-700',
    faturado: 'bg-blue-100 text-blue-700',
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

  const TIPO_COLORS: Record<string, string> = {
    'Custo Fixo': 'bg-red-100 text-red-700',
    'Custo Rotativo': 'bg-orange-100 text-orange-700',
    'Venda': 'bg-teal-100 text-teal-700',
  };

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(`/financeiro/fluxo-caixa?mes=${mes}&ano=${ano}`)
      .then((r) => {
        const d = (r.data as { data: typeof data }).data ?? r.data;
        setData(d as { receitas: string; custos: string; saldo: string; lancamentos: Lancamento[] });
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [mes, ano]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/financeiro/lancamentos', {
        uuid: crypto.randomUUID(),
        tipo: form.tipo,
        descricao: form.descricao || null,
        valor: moneyString(form.valor),
        data: form.data || null,
      });
      setShowForm(false);
      setForm({ tipo: 'Custo Fixo', descricao: '', valor: null, data: '' });
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <FiltroMesAno mes={mes} setMes={setMes} ano={ano} setAno={setAno} />
        <BtnPrimary onClick={() => setShowForm(true)}><Plus className='h-4 w-4' />Novo Lançamento</BtnPrimary>
      </div>

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

          <div className='rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden'>
            <div className='px-5 py-4 border-b border-slate-100'>
              <h3 className='text-xs font-semibold uppercase tracking-wider text-slate-400'>Lançamentos do Mês</h3>
            </div>
            {data.lancamentos.length === 0 ? (
              <div className='py-10 text-center text-sm text-slate-400'>Nenhum lançamento no período</div>
            ) : (
              <table className='w-full text-sm'>
                <thead>
                  <tr className='text-xs uppercase text-slate-400 bg-slate-50'>
                    <th className='px-5 py-3 text-left font-medium'>Tipo</th>
                    <th className='px-5 py-3 text-left font-medium'>Descrição</th>
                    <th className='px-5 py-3 text-left font-medium'>Data</th>
                    <th className='px-5 py-3 text-right font-medium'>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lancamentos.map((l) => (
                    <tr key={l.uuid} className='border-t border-slate-50 hover:bg-slate-50/50'>
                      <td className='px-5 py-3'>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_COLORS[l.tipo] ?? 'bg-slate-100 text-slate-600'}`}>
                          {l.tipo}
                        </span>
                      </td>
                      <td className='px-5 py-3 text-slate-700'>{l.descricao ?? '—'}</td>
                      <td className='px-5 py-3 text-slate-500'>{fmtDate(l.data)}</td>
                      <td className='px-5 py-3 text-right font-semibold text-slate-900'>{BRL.format(moneyForDisplay(l.valor))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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

function Empresas() {
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [grupos, setGrupos] = useState<{ fornecedor_id: number; razao_social: string; total_faturado: string; total_comissao: string; registros: Comissao[] }[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(`/financeiro/comissoes/por-empresa?mes=${mes}&ano=${ano}`)
      .then((r) => setGrupos((r.data as { data: typeof grupos }).data ?? r.data ?? []))
      .catch(() => setGrupos([]))
      .finally(() => setLoading(false));
  }, [mes, ano]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className='space-y-5'>
      <FiltroMesAno mes={mes} setMes={setMes} ano={ano} setAno={setAno} />
      {loading ? (
        <div className='py-8 text-center text-sm text-slate-400'>Carregando...</div>
      ) : grupos.length === 0 ? (
        <div className='py-10 text-center text-sm text-slate-400'>Nenhuma venda registrada no período</div>
      ) : (
        grupos.map((g) => (
          <div key={g.fornecedor_id} className='rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden'>
            <div className='px-5 py-4 border-b border-slate-100 flex items-center justify-between'>
              <h3 className='font-semibold text-slate-900'>📦 {g.razao_social}</h3>
              <div className='text-sm font-medium text-slate-600'>
                Fat: {BRL.format(moneyForDisplay(g.total_faturado))} · Com: {BRL.format(moneyForDisplay(g.total_comissao))}
              </div>
            </div>
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-xs uppercase text-slate-400 bg-slate-50'>
                  <th className='px-5 py-3 text-left font-medium'>Data</th>
                  <th className='px-5 py-3 text-left font-medium'>Cliente</th>
                  <th className='px-5 py-3 text-right font-medium'>Val. Fat.</th>
                  <th className='px-5 py-3 text-right font-medium'>%</th>
                  <th className='px-5 py-3 text-right font-medium'>Comissão</th>
                  <th className='px-5 py-3 text-left font-medium'>Status</th>
                </tr>
              </thead>
              <tbody>
                {g.registros.map((r) => (
                  <tr key={r.uuid} className='border-t border-slate-50 hover:bg-slate-50/50'>
                    <td className='px-5 py-3 text-slate-500'>{fmtDate(r.data_pedido)}</td>
                    <td className='px-5 py-3 text-slate-700'>{r.cliente?.razao_social ?? '—'}</td>
                    <td className='px-5 py-3 text-right text-slate-900 font-medium'>{BRL.format(moneyForDisplay(r.valor_faturado))}</td>
                    <td className='px-5 py-3 text-right text-slate-500'>{r.perc_comissao ?? '—'}%</td>
                    <td className='px-5 py-3 text-right font-semibold text-teal-700'>{BRL.format(moneyForDisplay(r.valor_comissao))}</td>
                    <td className='px-5 py-3'><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Tab: Comissão ────────────────────────────────────────────────────────────

function ComissaoAlune() {
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [status, setStatus] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [resumo, setResumo] = useState({ total: '0.00', faturado: '0.00', pendente: '0.00', pago: '0.00' });
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    data_pedido: string; data_faturamento: string; fornecedor_id: string;
    numero_pedido: string; numero_nfe: string; valor_pedido: number | null;
    valor_faturado: number | null; perc_comissao: string; valor_comissao: number | null;
    status: string;
  }>({
    data_pedido: '', data_faturamento: '', fornecedor_id: '',
    numero_pedido: '', numero_nfe: '', valor_pedido: null, valor_faturado: null,
    perc_comissao: '', valor_comissao: null, status: 'pendente',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/fornecedores?limit=100').then((r) => {
      setFornecedores((r.data as { data: Fornecedor[] }).data ?? r.data ?? []);
    }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
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
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mes, ano, status, fornecedorId]);

  useEffect(() => { load(); }, [load]);

  function calcVc(vp: number | null, pc: string): number | null {
    if (vp === null || pc.trim() === '') return null;
    try { return moneyForDisplay(percentageOf(vp, pc)); } catch { return null; }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/financeiro/comissoes', {
        uuid: crypto.randomUUID(),
        fornecedor_id: form.fornecedor_id ? Number(form.fornecedor_id) : undefined,
        numero_pedido: form.numero_pedido || null,
        numero_nfe: form.numero_nfe || null,
        data_pedido: form.data_pedido || null,
        data_faturamento: form.data_faturamento || null,
        valor_pedido: form.valor_pedido === null ? undefined : moneyString(form.valor_pedido),
        valor_faturado: form.valor_faturado === null ? undefined : moneyString(form.valor_faturado),
        perc_comissao: form.perc_comissao || undefined,
        valor_comissao: moneyString(form.valor_comissao),
        status: form.status,
      });
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  const sel = 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-[#2A9D8F]';

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <FiltroMesAno mes={mes} setMes={setMes} ano={ano} setAno={setAno} />
          <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className={sel}>
            <option value=''>Todos fornecedores</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
            <option value=''>Todos status</option>
            <option value='pendente'>Pendente</option>
            <option value='faturado'>Faturado</option>
            <option value='pago'>Pago</option>
          </select>
        </div>
        <BtnPrimary onClick={() => setShowForm(true)}><Plus className='h-4 w-4' />Nova Comissão</BtnPrimary>
      </div>

      {/* Resumo */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        {[
          { label: 'Total', value: resumo.total, color: 'text-slate-900' },
          { label: 'Faturado', value: resumo.faturado, color: 'text-blue-700' },
          { label: 'Pendente', value: resumo.pendente, color: 'text-orange-600' },
          { label: 'Pago', value: resumo.pago, color: 'text-teal-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className='rounded-xl bg-white border border-slate-100 shadow-sm p-4'>
            <p className='text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1'>{label}</p>
            <p className={`text-xl font-bold ${color}`}>{BRL.format(moneyForDisplay(value))}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className='rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden'>
        {loading ? (
          <div className='py-10 text-center text-sm text-slate-400'>Carregando...</div>
        ) : comissoes.length === 0 ? (
          <div className='py-10 text-center text-sm text-slate-400'>Nenhuma comissão no período</div>
        ) : (
          <table className='w-full text-sm'>
            <thead>
              <tr className='text-xs uppercase text-slate-400 bg-slate-50'>
                <th className='px-4 py-3 text-left font-medium'>Data Ped.</th>
                <th className='px-4 py-3 text-left font-medium'>Data Fat.</th>
                <th className='px-4 py-3 text-left font-medium'>Fornecedor</th>
                <th className='px-4 py-3 text-left font-medium'>NF-e</th>
                <th className='px-4 py-3 text-right font-medium'>Val. Fat.</th>
                <th className='px-4 py-3 text-right font-medium'>%</th>
                <th className='px-4 py-3 text-right font-medium'>Comissão</th>
                <th className='px-4 py-3 text-left font-medium'>Status</th>
              </tr>
            </thead>
            <tbody>
              {comissoes.map((c) => (
                <tr key={c.uuid} className='border-t border-slate-50 hover:bg-slate-50/50'>
                  <td className='px-4 py-3 text-slate-500'>{fmtDate(c.data_pedido)}</td>
                  <td className='px-4 py-3 text-slate-500'>{fmtDate(c.data_faturamento)}</td>
                  <td className='px-4 py-3 text-slate-700'>{c.fornecedor?.razao_social ?? '—'}</td>
                  <td className='px-4 py-3 text-slate-500'>{c.numero_nfe ?? '—'}</td>
                  <td className='px-4 py-3 text-right text-slate-900'>{BRL.format(moneyForDisplay(c.valor_faturado))}</td>
                  <td className='px-4 py-3 text-right text-slate-500'>{c.perc_comissao ?? '—'}%</td>
                  <td className='px-4 py-3 text-right font-semibold text-teal-700'>{BRL.format(moneyForDisplay(c.valor_comissao))}</td>
                  <td className='px-4 py-3'><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title='Nova Comissão' onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
              <Field label='Data do Pedido'>
                <input type='date' value={form.data_pedido} onChange={(e) => setForm((p) => ({ ...p, data_pedido: e.target.value }))} className={inputCls} />
              </Field>
              <Field label='Data de Faturamento'>
                <input type='date' value={form.data_faturamento} onChange={(e) => setForm((p) => ({ ...p, data_faturamento: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <Field label='Fornecedor'>
              <select value={form.fornecedor_id} onChange={(e) => setForm((p) => ({ ...p, fornecedor_id: e.target.value }))} className={inputCls}>
                <option value=''>Selecione</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
              </select>
            </Field>
            <div className='grid grid-cols-2 gap-3'>
              <Field label='Nº Pedido'>
                <input type='text' value={form.numero_pedido} onChange={(e) => setForm((p) => ({ ...p, numero_pedido: e.target.value }))} className={inputCls} />
              </Field>
              <Field label='NF-e'>
                <input type='text' value={form.numero_nfe} onChange={(e) => setForm((p) => ({ ...p, numero_nfe: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <Field label='Valor do Pedido'>
                <InputMoney value={form.valor_pedido} onChange={(val) => {
                  setForm((p) => ({ ...p, valor_pedido: val, valor_comissao: calcVc(val, p.perc_comissao) }));
                }} />
              </Field>
              <Field label='Valor Faturado'>
                <InputMoney value={form.valor_faturado} onChange={(val) => setForm((p) => ({ ...p, valor_faturado: val }))} />
              </Field>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <Field label='% Comissão'>
                <div className='relative'>
                  <input type='number' step='0.01' min='0' max='100' value={form.perc_comissao}
                    onChange={(e) => {
                      const pc = e.target.value;
                      setForm((p) => ({ ...p, perc_comissao: pc, valor_comissao: calcVc(p.valor_pedido, pc) }));
                    }} className={`${inputCls} pr-8`} />
                  <span className='absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none'>%</span>
                </div>
              </Field>
              <Field label='Valor Comissão'>
                <InputMoney value={form.valor_comissao} onChange={(val) => setForm((p) => ({ ...p, valor_comissao: val }))} required />
              </Field>
            </div>
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

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/financeiro/parceiros?mes=${mes}&ano=${ano}&limit=100`)
      .then((r) => setParceiros((r.data as { data: Parceiro[] }).data ?? r.data ?? []))
      .catch(() => setParceiros([]))
      .finally(() => setLoading(false));
  }, [mes, ano]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/financeiro/parceiros', {
        uuid: crypto.randomUUID(),
        nome_parceiro: form.nome_parceiro,
        empresa_parceiro: form.empresa_parceiro || null,
        data_pedido: form.data_pedido,
        data_faturamento: form.data_faturamento || null,
        valor_faturado: form.valor_faturado === null ? undefined : moneyString(form.valor_faturado),
        percentual_comissao: form.percentual_comissao || '50',
        valor_comissao: moneyString(form.valor_comissao),
        status: form.status,
      });
      setShowForm(false);
      load();
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
        <BtnPrimary onClick={() => setShowForm(true)}><Plus className='h-4 w-4' />Novo Lançamento</BtnPrimary>
      </div>

      {loading ? (
        <div className='py-8 text-center text-sm text-slate-400'>Carregando...</div>
      ) : Object.keys(grupos).length === 0 ? (
        <div className='py-10 text-center text-sm text-slate-400'>Nenhum parceiro no período</div>
      ) : (
        Object.values(grupos).map((g) => (
          <div key={g.nome} className='rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden'>
            <div className='px-5 py-4 border-b border-slate-100 flex items-center justify-between'>
              <div>
                <h3 className='font-semibold text-slate-900'>👤 {g.nome}</h3>
                {g.empresa && <p className='text-xs text-slate-400'>{g.empresa}</p>}
              </div>
              <div className='text-sm font-medium text-teal-700'>Total: {BRL.format(moneyForDisplay(g.total))}</div>
            </div>
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-xs uppercase text-slate-400 bg-slate-50'>
                  <th className='px-5 py-3 text-left font-medium'>Data</th>
                  <th className='px-5 py-3 text-left font-medium'>Cliente</th>
                  <th className='px-5 py-3 text-right font-medium'>Val. Fat.</th>
                  <th className='px-5 py-3 text-right font-medium'>%</th>
                  <th className='px-5 py-3 text-right font-medium'>Sua Parte</th>
                  <th className='px-5 py-3 text-left font-medium'>Status</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((p) => (
                  <tr key={p.uuid} className='border-t border-slate-50 hover:bg-slate-50/50'>
                    <td className='px-5 py-3 text-slate-500'>{fmtDate(p.data_pedido)}</td>
                    <td className='px-5 py-3 text-slate-700'>{p.cliente?.razao_social ?? '—'}</td>
                    <td className='px-5 py-3 text-right text-slate-900'>{BRL.format(moneyForDisplay(p.valor_faturado))}</td>
                    <td className='px-5 py-3 text-right text-slate-500'>{p.percentual_comissao}%</td>
                    <td className='px-5 py-3 text-right font-semibold text-teal-700'>{BRL.format(moneyForDisplay(p.valor_comissao))}</td>
                    <td className='px-5 py-3'><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  <input type='number' step='0.01' min='0' max='100' value={form.percentual_comissao}
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
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mes, ano]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/financeiro/lancamentos', {
        uuid: crypto.randomUUID(),
        tipo: form.tipo,
        descricao: form.descricao || null,
        valor: moneyString(form.valor),
        data: form.data || null,
      });
      setShowForm(false);
      load();
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

  function CustoTable({ items }: { items: Lancamento[] }) {
    return (
      <table className='w-full text-sm'>
        <thead>
          <tr className='text-xs uppercase text-slate-400 bg-slate-50'>
            <th className='px-5 py-3 text-left font-medium'>Descrição</th>
            <th className='px-5 py-3 text-left font-medium'>Data</th>
            <th className='px-5 py-3 text-right font-medium'>Valor</th>
            <th className='px-5 py-3 w-10' />
          </tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.uuid} className='border-t border-slate-50 hover:bg-slate-50/50'>
              <td className='px-5 py-3 text-slate-700'>{l.descricao ?? '—'}</td>
              <td className='px-5 py-3 text-slate-500'>{fmtDate(l.data)}</td>
              <td className='px-5 py-3 text-right font-semibold text-slate-900'>{BRL.format(moneyForDisplay(l.valor))}</td>
              <td className='px-5 py-3 text-right'>
                <button onClick={() => handleDelete(l.uuid, l.version)} className='text-slate-300 hover:text-red-500 transition-colors'>
                  <Trash2 className='h-4 w-4' />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <FiltroMesAno mes={mes} setMes={setMes} ano={ano} setAno={setAno} />
        <BtnPrimary onClick={() => setShowForm(true)}><Plus className='h-4 w-4' />Novo Custo</BtnPrimary>
      </div>

      <WriteError message={writeError} />

      {loading ? (
        <div className='py-8 text-center text-sm text-slate-400'>Carregando...</div>
      ) : (
        <>
          <div className='rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden'>
            <div className='px-5 py-4 border-b border-slate-100 flex items-center justify-between'>
              <h3 className='font-semibold text-slate-900'>📌 Custo Fixo</h3>
              <span className='text-sm font-medium text-red-600'>Total: {BRL.format(moneyForDisplay(totalFixo))}</span>
            </div>
            {fixos.length === 0
              ? <div className='py-6 text-center text-sm text-slate-400'>Nenhum custo fixo cadastrado</div>
              : <CustoTable items={fixos} />}
          </div>

          <div className='rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden'>
            <div className='px-5 py-4 border-b border-slate-100 flex items-center justify-between'>
              <h3 className='font-semibold text-slate-900'>🔄 Custo Rotativo</h3>
              <span className='text-sm font-medium text-orange-600'>Total: {BRL.format(moneyForDisplay(totalRotativo))}</span>
            </div>
            {rotativos.length === 0
              ? <div className='py-6 text-center text-sm text-slate-400'>Nenhum custo rotativo no mês</div>
              : <CustoTable items={rotativos} />}
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
  const [writeError, setWriteError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/financeiro/inadimplencia?limit=100')
      .then((r) => setItems((r.data as { data: Inadimplencia[] }).data ?? r.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/financeiro/inadimplencia', {
        uuid: crypto.randomUUID(),
        empresa_devedora: form.empresa_devedora,
        valor_aberto: moneyString(form.valor_aberto),
        observacao: form.observacao || null,
      });
      setShowForm(false);
      setForm({ empresa_devedora: '', valor_aberto: null, observacao: '' });
      load();
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
          <p className='text-3xl mb-3'>✅</p>
          <p className='text-slate-600 font-medium'>Nenhum registro de inadimplência. Parabéns!</p>
        </div>
      ) : (
        <div className='rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='text-xs uppercase text-slate-400 bg-slate-50'>
                <th className='px-5 py-3 text-left font-medium'>Cliente</th>
                <th className='px-5 py-3 text-left font-medium'>Empresa Devedora</th>
                <th className='px-5 py-3 text-right font-medium'>Valor Aberto</th>
                <th className='px-5 py-3 text-left font-medium'>Observação</th>
                <th className='px-5 py-3 w-10' />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.uuid} className='border-t border-slate-50 hover:bg-slate-50/50'>
                  <td className='px-5 py-3 text-slate-700'>{i.cliente?.razao_social ?? '—'}</td>
                  <td className='px-5 py-3 text-slate-700'>{i.empresa_devedora ?? '—'}</td>
                  <td className='px-5 py-3 text-right font-semibold text-red-600'>{BRL.format(moneyForDisplay(i.valor_aberto))}</td>
                  <td className='px-5 py-3 text-slate-500 max-w-xs truncate'>{i.observacao ?? '—'}</td>
                  <td className='px-5 py-3 text-right'>
                    <button onClick={() => handleDelete(i.uuid, i.version)} className='text-slate-300 hover:text-red-500 transition-colors'>
                      <Trash2 className='h-4 w-4' />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                ? 'border-[#2A9D8F] text-[#2A9D8F]'
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
