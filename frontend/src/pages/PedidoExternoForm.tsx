import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Unlock } from 'lucide-react';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { fetchOrder, liberarOrder, saveExternalOrder } from '@/services/orders.service';
import { fetchClients } from '@/services/clients.service';
import { orderStatusLabel, orderStatusColor, type Order, type OrderStatus, type Supplier, type Transport } from '@/types';
import { InputMoney } from '@/components/ui/InputMoney';
import { AsyncCombobox, type AsyncComboboxFetchResult, type AsyncComboboxOption } from '@/components/ui/AsyncCombobox';
import { getApiErrorMessage } from '@/lib/errors';
import { useAuth } from '@/hooks/useAuth';
import { useUuidDeCriacao } from '@/hooks/useUuidDeCriacao';
import { applyClientToOrderHeader } from '@/lib/clientSelection';
import { canLiberarPedido, isPedidoLocked } from '@/lib/orderPermissions';

/**
 * Pedido externo — digitado em sistema de terceiro e só registrado aqui.
 *
 * Cliente e fornecedor continuam sendo cadastros deste sistema (mesma regra do
 * pedido interno); no lugar dos itens entram número do pedido de origem, nome
 * do sistema e valor. Liberação, faturamento e cancelamento usam exatamente os
 * mesmos endpoints do pedido interno.
 */
type ExternalForm = {
  data: string; cliente_uuid: string; vendedor_uuid: string; fornecedor_uuid: string;
  transportadora_uuid: string; status: OrderStatus; numero_pedido_externo: string;
  sistema_origem: string; valor: number | null; pgt: string; prazo: string;
  local_entrega: string; tipo_faturamento: string; observacao: string;
};

type TenantUser = { authUserId: string; name: string; active: boolean };

const emptyForm: ExternalForm = {
  data: new Date().toISOString().slice(0, 10), cliente_uuid: '', vendedor_uuid: '', fornecedor_uuid: '',
  transportadora_uuid: '', status: 'em_aberto', numero_pedido_externo: '', sistema_origem: '',
  valor: null, pgt: '', prazo: '', local_entrega: '', tipo_faturamento: '', observacao: '',
};

const inputClass = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 disabled:bg-slate-50 disabled:text-slate-400';
const labelClass = 'text-xs font-semibold text-slate-600';

function orderToForm(order: Order, duplicating = false): ExternalForm {
  return {
    data: duplicating ? new Date().toISOString().slice(0, 10) : order.data ?? '',
    cliente_uuid: duplicating ? '' : order.cliente?.uuid ?? '', vendedor_uuid: order.vendedor?.uuid ?? '',
    fornecedor_uuid: order.fornecedor?.uuid ?? '', transportadora_uuid: duplicating ? '' : order.transportadora?.uuid ?? '',
    status: duplicating ? 'em_aberto' : order.status, numero_pedido_externo: duplicating ? '' : order.numero_pedido_externo ?? '',
    sistema_origem: order.sistema_origem ?? '',
    valor: order.total_com_imposto == null ? null : Number(order.total_com_imposto),
    pgt: duplicating ? '' : order.pgt ?? '', prazo: order.prazo ?? '', local_entrega: duplicating ? '' : order.local_entrega ?? '',
    tipo_faturamento: order.tipo_faturamento ?? '', observacao: order.observacao ?? '',
  };
}

function clientFetcher(search: string, page: number): Promise<AsyncComboboxFetchResult> {
  return fetchClients({ search, page, limit: 20 }).then((result) => ({
    options: result.data.map((client) => ({
      value: client.uuid,
      label: client.razao_social,
      description: client.cnpj ?? undefined,
      data: client,
    })),
    hasMore: result.meta.page < result.meta.totalPages,
  }));
}

export default function PedidoExternoForm() {
  const { uuid } = useParams<{ uuid: string }>();
  const [searchParams] = useSearchParams();
  const duplicateSourceUuid = uuid ? null : searchParams.get('duplicar');
  const navigate = useNavigate();
  const { hasAnyRole, hasPermission } = useAuth();
  const canChooseVendor = hasAnyRole(['ADMIN', 'GESTAO']);
  const isEdit = Boolean(uuid);
  const { uuid: uuidDeCriacao } = useUuidDeCriacao();
  const [form, setForm] = useState<ExternalForm>(emptyForm);
  const [clienteLabel, setClienteLabel] = useState('');
  const [version, setVersion] = useState<number | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liberando, setLiberando] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchAllPages<Supplier>('/fornecedores'),
      fetchAllPages<Transport>('/transportadoras'),
      canChooseVendor ? fetchAllPages<TenantUser>('/users').catch(() => null) : Promise.resolve(null),
      (uuid ?? duplicateSourceUuid) ? fetchOrder((uuid ?? duplicateSourceUuid)!) : Promise.resolve(null),
    ]).then(([suppliers, transports, vendorUsers, order]) => {
      if (!active) return;
      setSuppliers(suppliers); setTransports(transports);
      setUsers(vendorUsers?.filter((entry) => entry.active) ?? []);
      if (order) {
        if (duplicateSourceUuid && (order.origem ?? 'interno') !== 'externo') {
          setError('Somente pedido externo pode ser duplicado nesta tela.');
          return;
        }
        setForm(orderToForm(order, Boolean(duplicateSourceUuid)));
        setVersion(duplicateSourceUuid ? null : order.version);
        setClienteLabel(duplicateSourceUuid ? '' : order.cliente?.razao_social ?? '');
      }
    }).catch((reason) => { if (active) setError(getApiErrorMessage(reason)); })
      .finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, [canChooseVendor, duplicateSourceUuid, uuid]);

  // Mesma regra do pedido interno: liberado (ou além) trava a edição. O backend
  // já devolve 409; aqui só evitamos que o usuário preencha em vão.
  const locked = isEdit && isPedidoLocked(form.status);
  const canLiberar = isEdit && canLiberarPedido(hasPermission, form.status);

  function handleSelectClient(value: string | null, option: AsyncComboboxOption | null) {
    if (!value || !option) {
      setForm((current) => ({ ...current, cliente_uuid: '' }));
      setClienteLabel('');
      return;
    }
    const client = option.data as { pgt_padrao?: string | null; local_entrega?: string | null; transportadora?: { uuid: string } | null } | undefined;
    setForm((current) => applyClientToOrderHeader({ ...current, cliente_uuid: value }, client));
    setClienteLabel(option.label);
  }

  async function handleLiberar() {
    if (!uuid || version == null) return;
    setLiberando(true);
    setError(null);
    try {
      const updated = await liberarOrder(uuid, version);
      setForm((current) => ({ ...current, status: updated.status }));
      setVersion(updated.version);
    } catch (reason) {
      setError(getApiErrorMessage(reason));
    } finally {
      setLiberando(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    if (locked) return;
    if (!form.cliente_uuid || !form.fornecedor_uuid) { setError('Selecione cliente e fornecedor.'); return; }
    if (!form.numero_pedido_externo.trim() || !form.sistema_origem.trim()) {
      setError('Informe o número do pedido e o sistema de origem.'); return;
    }
    if (form.valor == null || form.valor <= 0) { setError('Informe o valor do pedido.'); return; }
    setLoading(true);
    // `status` e `origem` ficam fora do payload: são derivados pelo servidor e o
    // ValidationPipe roda com forbidNonWhitelisted — mandá-los devolveria 400.
    const payload: Record<string, unknown> = {
      uuid: uuid ?? uuidDeCriacao,
      cliente_uuid: form.cliente_uuid,
      fornecedor_uuid: form.fornecedor_uuid,
      vendedor_uuid: canChooseVendor && form.vendedor_uuid ? form.vendedor_uuid : undefined,
      transportadora_uuid: form.transportadora_uuid || null,
      numero_pedido_externo: form.numero_pedido_externo.trim(),
      sistema_origem: form.sistema_origem.trim(),
      valor: form.valor,
      data: form.data || null, pgt: form.pgt || null, prazo: form.prazo || null,
      local_entrega: form.local_entrega || null, tipo_faturamento: form.tipo_faturamento || null,
      observacao: form.observacao || null,
      ...(isEdit ? { version } : {}),
    };
    try {
      const saved = await saveExternalOrder(payload, uuid); navigate(`/pedidos/${saved.uuid}`);
    } catch (reason) { setError(getApiErrorMessage(reason)); }
    finally { setLoading(false); }
  }

  if (fetching) return <p className='py-20 text-center text-sm text-slate-600'>Carregando pedido...</p>;

  return (
    <form onSubmit={submit} className='mx-auto max-w-4xl space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900'>{isEdit ? 'Editar pedido externo' : duplicateSourceUuid ? 'Duplicar pedido externo' : 'Novo pedido externo'}</h1>
          <p className='mt-1 text-sm text-slate-600'>
            Pedido digitado em outro sistema. Liberação, faturamento e comissão seguem o mesmo fluxo do pedido interno.
          </p>
        </div>
        {isEdit && (
          <div className='flex items-center gap-2'>
            {canLiberar && (
              <button type='button' onClick={handleLiberar} disabled={liberando} className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60'>
                <Unlock className='h-4 w-4' />{liberando ? 'Liberando...' : 'Liberar pedido'}
              </button>
            )}
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${orderStatusColor[form.status]}`}>{orderStatusLabel[form.status]}</span>
          </div>
        )}
      </div>
      {error && <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800'>{error}</div>}
      {locked && (
        <div role='status' className='rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
          Este pedido já foi liberado e não pode mais ser editado.
        </div>
      )}

      <section className='rounded-lg border border-slate-200 bg-white p-5 shadow-sm'>
        <h2 className='mb-4 text-lg font-semibold text-slate-900'>Dados comerciais</h2>
        <div className='grid gap-4 md:grid-cols-3'>
          <label className='flex flex-col gap-1'><span className={labelClass}>Cliente *</span>
            <AsyncCombobox
              ariaLabel='Cliente'
              required
              disabled={locked}
              value={form.cliente_uuid || null}
              displayValue={clienteLabel}
              onChange={handleSelectClient}
              fetcher={clientFetcher}
              placeholder='Buscar por razão social ou CNPJ...'
              emptyMessage='Nenhum cliente encontrado.'
              errorMessage='Não foi possível carregar os clientes.'
            />
          </label>
          <label className='flex flex-col gap-1'><span className={labelClass}>Fornecedor *</span>
            <select disabled={locked} value={form.fornecedor_uuid} onChange={(e) => setForm((f) => ({ ...f, fornecedor_uuid: e.target.value }))} className={inputClass} required>
              <option value=''></option>{suppliers.map((supplier) => <option key={supplier.uuid} value={supplier.uuid}>{supplier.razao_social}</option>)}
            </select></label>
          <label className='flex flex-col gap-1'><span className={labelClass}>Data de emissão</span>
            <input disabled={locked} type='date' value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} className={inputClass} /></label>
          {canChooseVendor && <label className='flex flex-col gap-1'><span className={labelClass}>Vendedor</span>
            <select disabled={locked} value={form.vendedor_uuid} onChange={(e) => setForm((f) => ({ ...f, vendedor_uuid: e.target.value }))} className={inputClass}>
              <option value=''></option>{users.map((entry) => <option key={entry.authUserId} value={entry.authUserId}>{entry.name}</option>)}
            </select></label>}
          <label className='flex flex-col gap-1'><span className={labelClass}>Transportadora</span>
            <select disabled={locked} value={form.transportadora_uuid} onChange={(e) => setForm((f) => ({ ...f, transportadora_uuid: e.target.value }))} className={inputClass}>
              <option value=''></option>{transports.map((entry) => <option key={entry.uuid} value={entry.uuid}>{entry.razao_social}</option>)}
            </select></label>
        </div>
      </section>

      <section className='rounded-lg border border-slate-200 bg-white p-5 shadow-sm'>
        <h2 className='mb-4 text-lg font-semibold text-slate-900'>Pedido de origem</h2>
        <div className='grid gap-4 md:grid-cols-3'>
          <label className='flex flex-col gap-1'><span className={labelClass}>Número do pedido *</span>
            <input disabled={locked} value={form.numero_pedido_externo} onChange={(e) => setForm((f) => ({ ...f, numero_pedido_externo: e.target.value }))} maxLength={120} className={inputClass} required /></label>
          <label className='flex flex-col gap-1'><span className={labelClass}>Sistema onde foi digitado *</span>
            <input disabled={locked} value={form.sistema_origem} onChange={(e) => setForm((f) => ({ ...f, sistema_origem: e.target.value }))} maxLength={120} className={inputClass} required /></label>
          <label className='flex flex-col gap-1'><span className={labelClass}>Valor do pedido *</span>
            <InputMoney disabled={locked} value={form.valor} onChange={(value) => setForm((f) => ({ ...f, valor: value }))} /></label>
          {(['pgt', 'prazo', 'local_entrega', 'tipo_faturamento'] as const).map((field) => <label key={field} className='flex flex-col gap-1'>
            <span className={labelClass}>{{ pgt: 'Forma de pagamento', prazo: 'Prazo', local_entrega: 'Local de entrega', tipo_faturamento: 'Tipo de faturamento' }[field]}</span>
            <input disabled={locked} value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} className={inputClass} /></label>)}
          <label className='flex flex-col gap-1 md:col-span-3'><span className={labelClass}>Observações</span>
            <textarea disabled={locked} value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} rows={3} className={`${inputClass} resize-y`} /></label>
        </div>
      </section>

      <div className='flex justify-end gap-3'>
        <button type='button' onClick={() => navigate(uuid ? `/pedidos/${uuid}` : '/pedidos')} className='min-h-11 rounded-lg border border-slate-300 px-5 text-sm font-medium text-slate-700'>Voltar</button>
        <button type='submit' disabled={loading || locked || (isEdit && version == null)} className='min-h-11 rounded-lg bg-primary px-5 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60'>{loading ? 'Salvando...' : 'Salvar pedido'}</button>
      </div>
    </form>
  );
}
