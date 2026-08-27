import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Unlock } from 'lucide-react';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { fetchOrder, liberarOrder, saveOrder } from '@/services/orders.service';
import { fetchClients } from '@/services/clients.service';
import { orderStatusLabel, orderStatusColor, type Order, type OrderStatus, type Product, type Supplier, type Transport } from '@/types';
import { InputMoney } from '@/components/ui/InputMoney';
import { AsyncCombobox, type AsyncComboboxFetchResult, type AsyncComboboxOption } from '@/components/ui/AsyncCombobox';
import { moneyForDisplay, qtyForDisplay } from '@/lib/decimal';
import { previewItem, previewOrder } from '@/lib/orderCalculation';
import { getApiErrorMessage } from '@/lib/errors';
import { useAuth } from '@/hooks/useAuth';
import { useUuidDeCriacao } from '@/hooks/useUuidDeCriacao';
import { applyClientToOrderHeader } from '@/lib/clientSelection';
import { canLiberarPedido, isPedidoLocked } from '@/lib/orderPermissions';
import { deleteOrderItemPhoto, fetchOrderItemPhoto, fetchOrderItemPhotoDataUrl, uploadOrderItemPhoto } from '@/services/productPhotos.service';
import OrderItemPhotoField from '@/components/orders/OrderItemPhotoField';

type HeaderForm = {
  data: string; cliente_uuid: string; vendedor_uuid: string; fornecedor_uuid: string;
  transportadora_uuid: string; status: OrderStatus; pgt: string; prazo: string;
  local_entrega: string; tipo_faturamento: string; observacao: string;
};

type ItemForm = {
  uuid: string; produto_uuid: string; codigo_manual: string; descricao_manual: string;
  qtd_caixas: string; qtd_unitaria: string; preco_unitario: number | null;
  desconto_perc: string; ipi_perc: string;
  /**
   * BACKLOG-0066: a linha perdeu o produto porque o fornecedor mudou e precisa
   * de um novo. Flag explícita, não derivada de `produto_uuid` vazio — uma
   * linha recém-adicionada também está sem produto e não é órfã.
   */
  precisa_produto: boolean;
  foto: File | null; fotoPreview: string | null; fotoVersion: number | null;
};

type TenantUser = { authUserId: string; name: string; active: boolean };

const emptyHeader: HeaderForm = {
  data: new Date().toISOString().slice(0, 10), cliente_uuid: '', vendedor_uuid: '', fornecedor_uuid: '',
  transportadora_uuid: '', status: 'em_aberto', pgt: '', prazo: '', local_entrega: '',
  tipo_faturamento: '', observacao: '',
};

const newItem = (): ItemForm => ({
  uuid: crypto.randomUUID(), produto_uuid: '', codigo_manual: '', descricao_manual: '',
  qtd_caixas: '1', qtd_unitaria: '1', preco_unitario: null, desconto_perc: '0', ipi_perc: '0',
  precisa_produto: false,
  foto: null, fotoPreview: null, fotoVersion: null,
});

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 disabled:bg-slate-50 disabled:text-slate-400';
const labelClass = 'text-xs font-semibold text-slate-600';

function orderToForm(order: Order): { header: HeaderForm; items: ItemForm[] } {
  return {
    header: {
      data: order.data ?? '', cliente_uuid: order.cliente?.uuid ?? '', vendedor_uuid: order.vendedor?.uuid ?? '',
      fornecedor_uuid: order.fornecedor?.uuid ?? '', transportadora_uuid: order.transportadora?.uuid ?? '',
      status: order.status, pgt: order.pgt ?? '', prazo: order.prazo ?? '', local_entrega: order.local_entrega ?? '',
      tipo_faturamento: order.tipo_faturamento ?? '', observacao: order.observacao ?? '',
    },
    items: order.itens.map((item) => ({
      uuid: item.uuid, produto_uuid: item.produto?.uuid ?? '', codigo_manual: item.codigo_manual ?? item.produto?.codigo ?? '',
      descricao_manual: item.descricao_manual ?? item.produto?.descricao ?? '', qtd_caixas: item.qtd_caixas ?? '0',
      qtd_unitaria: item.qtd_unitaria ?? '0', preco_unitario: item.preco_unitario == null ? null : Number(item.preco_unitario),
      desconto_perc: item.desconto_perc ?? '0', ipi_perc: item.ipi_perc ?? '0',
      precisa_produto: false,
      foto: null, fotoPreview: null, fotoVersion: null,
    })),
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

export default function PedidoForm() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { hasAnyRole, hasPermission } = useAuth();
  const canChooseVendor = hasAnyRole(['ADMIN', 'GESTAO']);
  const isEdit = Boolean(uuid);
  const { uuid: uuidDeCriacao } = useUuidDeCriacao();
  const [header, setHeader] = useState<HeaderForm>(emptyHeader);
  const [clienteLabel, setClienteLabel] = useState('');
  const [items, setItems] = useState<ItemForm[]>([newItem()]);
  const [version, setVersion] = useState<number | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liberando, setLiberando] = useState(false);
  const [persistedUuid, setPersistedUuid] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchAllPages<Supplier>('/fornecedores'),
      fetchAllPages<Transport>('/transportadoras'),
      canChooseVendor ? fetchAllPages<TenantUser>('/users').catch(() => null) : Promise.resolve(null),
      uuid ? fetchOrder(uuid) : Promise.resolve(null),
    ]).then(([suppliers, transports, vendorUsers, order]) => {
      if (!active) return;
      setSuppliers(suppliers); setTransports(transports);
      setUsers(vendorUsers?.filter((entry) => entry.active) ?? []);
      if (order) {
        const mapped = orderToForm(order); setHeader(mapped.header); setItems(mapped.items.length ? mapped.items : [newItem()]);
        setVersion(order.version); setClienteLabel(order.cliente?.razao_social ?? '');
        void Promise.all(mapped.items.map(async (item) => {
          const metadata = await fetchOrderItemPhoto(order.uuid, item.uuid);
          if (!metadata) return;
          const preview = await fetchOrderItemPhotoDataUrl(order.uuid, item.uuid);
          if (active) updateItemPhotoState(item.uuid, { fotoPreview: preview, fotoVersion: metadata.version });
        })).catch(() => undefined);
      }
    }).catch((reason) => { if (active) setError(getApiErrorMessage(reason)); })
      .finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, [canChooseVendor, uuid]);

  useEffect(() => {
    if (!header.fornecedor_uuid) { setProducts([]); return; }
    let active = true;
    fetchAllPages<Product>('/produtos', { fornecedor_uuid: header.fornecedor_uuid })
      .then((products) => { if (active) setProducts(products); })
      .catch((reason) => { if (active) setError(getApiErrorMessage(reason)); });
    return () => { active = false; };
  }, [header.fornecedor_uuid]);

  const totals = previewOrder(items);
  const itensSemProduto = items.filter((item) => item.precisa_produto).length;
  // Transportadora vinculada — tel/end exibidos automaticamente (§3.2), read-only
  const selectedTransport = transports.find((t) => t.uuid === header.transportadora_uuid);
  const readonlyClass = 'min-h-11 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500 outline-none';

  // Pedido liberado (ou além) trava edição de dados comerciais e itens — o backend já bloqueia
  // com 409, aqui só refletimos a mesma regra na UI para não deixar o usuário preencher em vão.
  const locked = isEdit && isPedidoLocked(header.status);
  const canLiberar = isEdit && canLiberarPedido(hasPermission, header.status);

  function handleSelectClient(value: string | null, option: AsyncComboboxOption | null) {
    if (!value || !option) {
      setHeader((current) => ({ ...current, cliente_uuid: '' }));
      setClienteLabel('');
      return;
    }
    const client = option.data as { pgt_padrao?: string | null; local_entrega?: string | null; transportadora?: { uuid: string } | null } | undefined;
    setHeader((current) => applyClientToOrderHeader({ ...current, cliente_uuid: value }, client));
    setClienteLabel(option.label);
  }

  /**
   * BACKLOG-0066: trocar o fornecedor descartava a lista inteira
   * (`setItems([newItem()])`), sem aviso e sem undo — em edição isso perdia os
   * `uuid` dos itens persistidos, e como o PUT manda `itens` completo, salvar
   * depois apagava os itens no backend e quebrava os rótulos das fotos.
   *
   * Agora a linha sobrevive: só o que veio do produto do fornecedor antigo é
   * desvinculado, e a linha é marcada para revisão. Quantidades e percentuais
   * digitados ficam.
   */
  function handleSupplierChange(nextUuid: string) {
    if (nextUuid === header.fornecedor_uuid) return;
    setHeader((current) => ({ ...current, fornecedor_uuid: nextUuid }));
    setItems((current) => current.map((item) => item.produto_uuid ? {
      ...item,
      produto_uuid: '', codigo_manual: '', descricao_manual: '', preco_unitario: null,
      precisa_produto: true,
    } : item)); // linha manual não depende de fornecedor: fica intacta
  }

  function chooseProduct(itemUuid: string, productUuid: string) {
    const product = products.find((entry) => entry.uuid === productUuid);
    setItems((current) => current.map((item) => item.uuid === itemUuid ? {
      ...item, produto_uuid: productUuid, codigo_manual: product?.codigo ?? item.codigo_manual,
      descricao_manual: product?.descricao ?? item.descricao_manual,
      preco_unitario: product?.preco_base == null ? item.preco_unitario : Number(product.preco_base),
      ipi_perc: product?.ipi_perc == null ? item.ipi_perc : String(product.ipi_perc),
      precisa_produto: productUuid ? false : item.precisa_produto,
    } : item));
  }

  function updateItem(itemUuid: string, patch: Partial<ItemForm>) {
    setItems((current) => current.map((item) => {
      if (item.uuid !== itemUuid) return item;
      const updated = { ...item, ...patch };
      // Digitar código ou descrição torna a linha manual — e manual é válido.
      if (updated.precisa_produto && (updated.codigo_manual.trim() || updated.descricao_manual.trim())) {
        updated.precisa_produto = false;
      }
      return updated;
    }));
  }

  // Soltar um arquivo em qualquer ponto da janela faz o navegador abrir esse
  // arquivo — no meio de um pedido, isso descarta tudo que foi digitado.
  useEffect(() => {
    const block = (event: DragEvent) => event.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  function updateItemPhotoState(itemUuid: string, patch: Partial<ItemForm>) {
    setItems((current) => current.map((item) => item.uuid === itemUuid ? { ...item, ...patch } : item));
  }

  function chooseItemPhoto(itemUuid: string, file: File | null) {
    if (!file) return;
    updateItemPhotoState(itemUuid, { foto: file, fotoPreview: URL.createObjectURL(file) });
  }

  async function removeItemPhoto(item: ItemForm) {
    try {
      if ((uuid ?? persistedUuid) && item.fotoVersion != null) {
        await deleteOrderItemPhoto((uuid ?? persistedUuid)!, item.uuid, item.fotoVersion);
      }
      updateItemPhotoState(item.uuid, { foto: null, fotoPreview: null, fotoVersion: null });
    } catch (reason) { setError(getApiErrorMessage(reason)); }
  }

  async function handleLiberar() {
    if (!uuid || version == null) return;
    setLiberando(true);
    setError(null);
    try {
      const updated = await liberarOrder(uuid, version);
      setHeader((current) => ({ ...current, status: updated.status }));
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
    if (!header.cliente_uuid || !header.fornecedor_uuid) { setError('Selecione cliente e fornecedor.'); return; }
    if (items.some((item) => !item.produto_uuid && !item.codigo_manual.trim() && !item.descricao_manual.trim())) {
      setError('Cada item precisa de um produto ou de código/descrição manual.'); return;
    }
    setLoading(true);
    // `status` fica fora do payload: o backend não aceita mais status no corpo
    // de create/update (é derivado — liberação/cancelamento/faturamento têm
    // endpoints próprios), e o ValidationPipe roda com forbidNonWhitelisted,
    // então mandá-lo devolveria 400 em todo save.
    const { status: _status, ...headerFields } = header;
    const payload: Record<string, unknown> = {
      uuid: uuid ?? uuidDeCriacao, ...headerFields,
      vendedor_uuid: canChooseVendor && header.vendedor_uuid ? header.vendedor_uuid : undefined,
      transportadora_uuid: header.transportadora_uuid || null,
      data: header.data || null, pgt: header.pgt || null, prazo: header.prazo || null,
      local_entrega: header.local_entrega || null, tipo_faturamento: header.tipo_faturamento || null,
      observacao: header.observacao || null,
      itens: items.map((item) => ({
        uuid: item.uuid, produto_uuid: item.produto_uuid || undefined, codigo_manual: item.codigo_manual || null,
        descricao_manual: item.descricao_manual || null, qtd_caixas: Number(item.qtd_caixas || 0),
        qtd_unitaria: Number(item.qtd_unitaria || 0), preco_unitario: item.preco_unitario ?? 0,
        desconto_perc: Number(item.desconto_perc || 0),
        ipi_perc: Number(item.ipi_perc || 0),
      })),
      ...((isEdit || persistedUuid) ? { version } : {}),
    };
    try {
      const saved = await saveOrder(payload, uuid ?? persistedUuid ?? undefined);
      setPersistedUuid(saved.uuid); setVersion(saved.version);
      const uploads = await Promise.allSettled(items.filter((item) => item.foto).map(async (item) => {
        const metadata = await uploadOrderItemPhoto(saved.uuid, item.uuid, item.foto!);
        updateItemPhotoState(item.uuid, { foto: null, fotoVersion: metadata.version });
      }));
      const failed = uploads.filter((result) => result.status === 'rejected').length;
      if (failed) {
        setError(`O pedido foi salvo, mas ${failed} foto(s) não foram enviadas. Tente salvar novamente para reenviar somente as fotos pendentes.`);
        return;
      }
      navigate(`/pedidos/${saved.uuid}`);
    } catch (reason) { setError(getApiErrorMessage(reason)); }
    finally { setLoading(false); }
  }

  if (fetching) return <p className='py-20 text-center text-sm text-slate-600'>Carregando pedido...</p>;

  return (
    <form onSubmit={submit} className='mx-auto max-w-6xl space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div><h1 className='text-2xl font-bold text-slate-900'>{isEdit ? 'Editar pedido' : 'Novo pedido'}</h1>
          <p className='mt-1 text-sm text-slate-600'>O servidor recalcula quantidades, descontos, IPI e totais ao salvar.</p></div>
        {isEdit && (
          <div className='flex items-center gap-2'>
            {canLiberar && (
              <button type='button' onClick={handleLiberar} disabled={liberando} className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60'>
                <Unlock className='h-4 w-4' />{liberando ? 'Liberando...' : 'Liberar pedido'}
              </button>
            )}
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${orderStatusColor[header.status]}`}>{orderStatusLabel[header.status]}</span>
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
              value={header.cliente_uuid || null}
              displayValue={clienteLabel}
              onChange={handleSelectClient}
              fetcher={clientFetcher}
              placeholder='Buscar por razão social ou CNPJ...'
              emptyMessage='Nenhum cliente encontrado.'
              errorMessage='Não foi possível carregar os clientes.'
            />
          </label>
          <label className='flex flex-col gap-1'><span className={labelClass}>Fornecedor *</span>
            <select disabled={locked} value={header.fornecedor_uuid} onChange={(e) => handleSupplierChange(e.target.value)} className={inputClass} required>
              <option value=''></option>{suppliers.map((supplier) => <option key={supplier.uuid} value={supplier.uuid}>{supplier.razao_social}</option>)}
            </select></label>
          <label className='flex flex-col gap-1'><span className={labelClass}>Data de emissão</span>
            <input disabled={locked} type='date' value={header.data} onChange={(e) => setHeader((h) => ({ ...h, data: e.target.value }))} className={inputClass} /></label>
          {canChooseVendor && <label className='flex flex-col gap-1'><span className={labelClass}>Vendedor</span>
            <select disabled={locked} value={header.vendedor_uuid} onChange={(e) => setHeader((h) => ({ ...h, vendedor_uuid: e.target.value }))} className={inputClass}>
              <option value=''></option>{users.map((entry) => <option key={entry.authUserId} value={entry.authUserId}>{entry.name}</option>)}
            </select></label>}
          <label className='flex flex-col gap-1'><span className={labelClass}>Transportadora</span>
            <select disabled={locked} value={header.transportadora_uuid} onChange={(e) => setHeader((h) => ({ ...h, transportadora_uuid: e.target.value }))} className={inputClass}>
              <option value=''></option>{transports.map((entry) => <option key={entry.uuid} value={entry.uuid}>{entry.razao_social}</option>)}
            </select></label>
          <label className='flex flex-col gap-1'><span className={labelClass}>Tel. Transporte</span>
            <input value={selectedTransport?.telefone ?? ''} readOnly placeholder='Selecione a transportadora' className={readonlyClass} /></label>
          <label className='flex flex-col gap-1'><span className={labelClass}>End. Transporte</span>
            <input value={selectedTransport?.endereco_completo ?? ''} readOnly placeholder='Selecione a transportadora' className={readonlyClass} /></label>
          {(['pgt', 'prazo', 'local_entrega', 'tipo_faturamento'] as const).map((field) => <label key={field} className='flex flex-col gap-1'>
            <span className={labelClass}>{{ pgt: 'Forma de pagamento', prazo: 'Prazo', local_entrega: 'Local de entrega', tipo_faturamento: 'Tipo de faturamento' }[field]}</span>
            <input disabled={locked} value={header[field]} onChange={(e) => setHeader((h) => ({ ...h, [field]: e.target.value }))} className={inputClass} /></label>)}
          <label className='flex flex-col gap-1 md:col-span-3'><span className={labelClass}>Observações</span>
            <textarea disabled={locked} value={header.observacao} onChange={(e) => setHeader((h) => ({ ...h, observacao: e.target.value }))} rows={3} className={`${inputClass} resize-y`} /></label>
        </div>
      </section>

      <section className='rounded-lg border border-slate-200 bg-white p-5 shadow-sm'>
        <div className='mb-4 flex items-center justify-between'><h2 className='text-lg font-semibold text-slate-900'>Itens</h2>
          <button type='button' disabled={locked} onClick={() => setItems((current) => [...current, newItem()])} className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'><Plus className='h-4 w-4' />Adicionar item</button></div>
        {itensSemProduto > 0 && (
          <div role='status' className='mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
            O fornecedor mudou: {itensSemProduto === 1 ? '1 item precisa' : `${itensSemProduto} itens precisam`} de um novo produto. Quantidades e percentuais foram preservados.
          </div>
        )}
        <div className='space-y-4'>{items.map((item, index) => { const calculated = previewItem(item); return <div key={item.uuid} className={`rounded-lg border p-4 ${item.precisa_produto ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}>
          <div className='mb-3 flex justify-between'><strong className='text-sm text-slate-800'>Item {index + 1}</strong><button type='button' aria-label={`Remover item ${index + 1}`} disabled={items.length === 1 || locked}
            onClick={() => setItems((current) => current.filter((entry) => entry.uuid !== item.uuid))} className='rounded-md p-2 text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40'><Trash2 className='h-4 w-4' /></button></div>
          <div className='grid gap-3 md:grid-cols-4'>
            <label className='flex flex-col gap-1 md:col-span-2'><span className={labelClass}>Produto cadastrado</span><select disabled={locked} value={item.produto_uuid} aria-invalid={item.precisa_produto || undefined} onChange={(e) => chooseProduct(item.uuid, e.target.value)} className={`${inputClass}${item.precisa_produto ? ' border-amber-400' : ''}`}><option value=''></option>{products.map((product) => <option key={product.uuid} value={product.uuid}>{product.codigo ? `${product.codigo} — ` : ''}{product.descricao}</option>)}</select></label>
            <label className='flex flex-col gap-1'><span className={labelClass}>Código</span><input disabled={locked} value={item.codigo_manual} onChange={(e) => updateItem(item.uuid, { codigo_manual: e.target.value })} className={inputClass} /></label>
            <label className='flex flex-col gap-1'><span className={labelClass}>Descrição</span><input disabled={locked} value={item.descricao_manual} onChange={(e) => updateItem(item.uuid, { descricao_manual: e.target.value })} className={inputClass} /></label>
            <label className='flex flex-col gap-1'><span className={labelClass}>Caixas</span><input disabled={locked} type='number' min='0' step='0.001' value={item.qtd_caixas} onChange={(e) => updateItem(item.uuid, { qtd_caixas: e.target.value })} className={inputClass} required /></label>
            <label className='flex flex-col gap-1'><span className={labelClass}>Unidades por caixa</span><input disabled={locked} type='number' min='0' step='0.001' value={item.qtd_unitaria} onChange={(e) => updateItem(item.uuid, { qtd_unitaria: e.target.value })} className={inputClass} required /></label>
            <label className='flex flex-col gap-1'><span className={labelClass}>Preço unitário</span><InputMoney disabled={locked} value={item.preco_unitario} onChange={(value) => updateItem(item.uuid, { preco_unitario: value })} /></label>
            <label className='flex flex-col gap-1'><span className={labelClass}>Desconto (%)</span><input disabled={locked} type='number' min='0' max='100' step='0.01' value={item.desconto_perc} onChange={(e) => updateItem(item.uuid, { desconto_perc: e.target.value })} className={inputClass} /></label>
            <label className='flex flex-col gap-1'><span className={labelClass}>IPI (%)</span><input disabled={locked} type='number' min='0' max='100' step='0.01' value={item.ipi_perc} onChange={(e) => updateItem(item.uuid, { ipi_perc: e.target.value })} className={inputClass} /></label>
            <OrderItemPhotoField
              index={index}
              fotoPreview={item.fotoPreview}
              locked={locked}
              onChoose={(file) => chooseItemPhoto(item.uuid, file)}
              onRemove={() => void removeItemPhoto(item)}
            />
            <div className='md:col-span-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700'><span>{qtyForDisplay(item.qtd_caixas || 0)} cx × {qtyForDisplay(item.qtd_unitaria || 0)} un = <strong>{qtyForDisplay(calculated.qtd_total)}</strong></span><span>Valor unitário com desconto: <strong>{BRL.format(moneyForDisplay(calculated.valor_com_desconto))}</strong></span><span>Sem IPI: <strong>{BRL.format(moneyForDisplay(calculated.total_sem_imposto))}</strong></span><span>Com IPI: <strong>{BRL.format(moneyForDisplay(calculated.total_com_imposto))}</strong></span></div>
          </div></div>; })}</div>
        <div className='mt-5 flex justify-end gap-8 border-t border-slate-200 pt-4 text-right'><div><span className='block text-xs text-slate-600'>Total sem imposto</span><strong>{BRL.format(moneyForDisplay(totals.semImposto))}</strong></div><div><span className='block text-xs text-slate-600'>Total com imposto</span><strong className='text-lg text-slate-900'>{BRL.format(moneyForDisplay(totals.comImposto))}</strong></div></div>
      </section>

      <div className='flex justify-end gap-3'><button type='button' onClick={() => navigate(uuid ? `/pedidos/${uuid}` : '/pedidos')} className='min-h-11 rounded-lg border border-slate-300 px-5 text-sm font-medium text-slate-700'>Voltar</button><button type='submit' disabled={loading || locked || (isEdit && version == null)} className='min-h-11 rounded-lg bg-primary px-5 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60'>{loading ? 'Salvando...' : 'Salvar pedido'}</button></div>
    </form>
  );
}
