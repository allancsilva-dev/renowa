import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { fetchSacTicket, saveSacTicket } from '@/services/sac.service';
import { fetchClients } from '@/services/clients.service';
import {
  sacStatusLabel, sacStatusColor, type Product, type SacStatus, type SacTicket, type Supplier,
} from '@/types';
import { InputMoney } from '@/components/ui/InputMoney';
import { AsyncCombobox, type AsyncComboboxFetchResult, type AsyncComboboxOption } from '@/components/ui/AsyncCombobox';
import { moneyForDisplay } from '@/lib/decimal';
import { previewSacItem, previewSacTotal } from '@/lib/sacCalculation';
import { getApiErrorMessage } from '@/lib/errors';
import { useUuidDeCriacao } from '@/hooks/useUuidDeCriacao';

type HeaderForm = {
  cliente_uuid: string; fornecedor_uuid: string; numero_nfe: string;
  data: string; observacao: string; status: SacStatus;
};

type ItemForm = {
  uuid: string; produto_uuid: string; codigo: string;
  quantidade: string; motivo: string; valor_unitario: number | null;
};

const emptyHeader: HeaderForm = {
  cliente_uuid: '', fornecedor_uuid: '', numero_nfe: '',
  data: new Date().toISOString().slice(0, 10), observacao: '', status: 'aberto',
};

const newItem = (): ItemForm => ({
  uuid: crypto.randomUUID(), produto_uuid: '', codigo: '',
  quantidade: '1', motivo: '', valor_unitario: null,
});

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 disabled:bg-slate-50 disabled:text-slate-400';
const labelClass = 'text-xs font-semibold text-slate-600';

/** Chamado resolvido ou cancelado é terminal — a UI espelha a guarda do backend. */
const EDITAVEL: SacStatus[] = ['aberto', 'em_andamento'];

function ticketToForm(ticket: SacTicket): { header: HeaderForm; items: ItemForm[] } {
  return {
    header: {
      cliente_uuid: ticket.cliente?.uuid ?? '', fornecedor_uuid: ticket.fornecedor?.uuid ?? '',
      numero_nfe: ticket.numero_nfe ?? '', data: ticket.data ?? '',
      observacao: ticket.observacao ?? '', status: ticket.status,
    },
    items: ticket.itens.map((item) => ({
      uuid: item.uuid, produto_uuid: item.produto?.uuid ?? '', codigo: item.codigo,
      quantidade: item.quantidade ?? '0', motivo: item.motivo,
      valor_unitario: item.valor_unitario == null ? null : Number(item.valor_unitario),
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

export default function SacForm() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(uuid);
  const { uuid: uuidDeCriacao } = useUuidDeCriacao();
  const [header, setHeader] = useState<HeaderForm>(emptyHeader);
  const [clienteLabel, setClienteLabel] = useState('');
  const [items, setItems] = useState<ItemForm[]>([newItem()]);
  const [version, setVersion] = useState<number | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchAllPages<Supplier>('/fornecedores'),
      uuid ? fetchSacTicket(uuid) : Promise.resolve(null),
    ]).then(([suppliers, ticket]) => {
      if (!active) return;
      setSuppliers(suppliers);
      if (ticket) {
        const mapped = ticketToForm(ticket);
        setHeader(mapped.header);
        setItems(mapped.items.length ? mapped.items : [newItem()]);
        setVersion(ticket.version);
        setClienteLabel(ticket.cliente?.razao_social ?? '');
      }
    }).catch((reason) => { if (active) setError(getApiErrorMessage(reason)); })
      .finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, [uuid]);

  // Produtos do fornecedor: preenchem o COD sem obrigar cadastro prévio.
  useEffect(() => {
    if (!header.fornecedor_uuid) { setProducts([]); return; }
    let active = true;
    fetchAllPages<Product>('/produtos', { fornecedor_uuid: header.fornecedor_uuid })
      .then((products) => { if (active) setProducts(products); })
      .catch((reason) => { if (active) setError(getApiErrorMessage(reason)); });
    return () => { active = false; };
  }, [header.fornecedor_uuid]);

  const locked = isEdit && !EDITAVEL.includes(header.status);
  const total = previewSacTotal(items.map((item) => ({
    quantidade: item.quantidade, valor_unitario: item.valor_unitario,
  })));

  function handleSelectClient(value: string | null, option: AsyncComboboxOption | null) {
    setHeader((current) => ({ ...current, cliente_uuid: value ?? '' }));
    setClienteLabel(option?.label ?? '');
  }

  function addItem() {
    setItems((current) => [...current, newItem()]);
  }

  function updateItem(itemUuid: string, patch: Partial<ItemForm>) {
    setItems((current) => current.map((item) => item.uuid === itemUuid ? { ...item, ...patch } : item));
  }

  function chooseProduct(itemUuid: string, productUuid: string) {
    const product = products.find((entry) => entry.uuid === productUuid);
    updateItem(itemUuid, {
      produto_uuid: productUuid,
      codigo: product?.codigo ?? '',
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    if (locked) return;
    if (!header.cliente_uuid || !header.fornecedor_uuid) { setError('Selecione cliente e fornecedor.'); return; }
    if (items.some((item) => !item.codigo.trim() || !item.motivo.trim())) {
      setError('Cada linha precisa de código e motivo.'); return;
    }
    setLoading(true);
    // `status`, `total` e `valor_total` ficam fora do payload: são derivados
    // pelo servidor e o ValidationPipe roda com forbidNonWhitelisted.
    const payload: Record<string, unknown> = {
      uuid: uuid ?? uuidDeCriacao,
      cliente_uuid: header.cliente_uuid,
      fornecedor_uuid: header.fornecedor_uuid,
      numero_nfe: header.numero_nfe || null,
      data: header.data || null,
      observacao: header.observacao || null,
      itens: items.map((item) => ({
        uuid: item.uuid,
        produto_uuid: item.produto_uuid || undefined,
        codigo: item.codigo.trim(),
        quantidade: Number(item.quantidade || 0),
        motivo: item.motivo.trim(),
        valor_unitario: item.valor_unitario ?? 0,
      })),
      ...(isEdit ? { version } : {}),
    };
    try {
      const saved = await saveSacTicket(payload, uuid); navigate(`/sac/${saved.uuid}`);
    } catch (reason) { setError(getApiErrorMessage(reason)); }
    finally { setLoading(false); }
  }

  if (fetching) return <p className='py-20 text-center text-sm text-slate-600'>Carregando chamado...</p>;

  return (
    <form onSubmit={submit} className='mx-auto max-w-5xl space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900'>{isEdit ? 'Editar chamado SAC' : 'Nova abertura de SAC'}</h1>
          <p className='mt-1 text-sm text-slate-600'>O servidor recalcula os valores das linhas e o total ao salvar.</p>
        </div>
        {isEdit && (
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${sacStatusColor[header.status]}`}>
            {sacStatusLabel[header.status]}
          </span>
        )}
      </div>
      {error && <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800'>{error}</div>}
      {locked && (
        <div role='status' className='rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
          Este chamado já foi {sacStatusLabel[header.status].toLowerCase()} e não pode mais ser editado.
        </div>
      )}

      <section className='rounded-lg border border-slate-200 bg-white p-5 shadow-sm'>
        <h2 className='mb-4 text-lg font-semibold text-slate-900'>Dados do chamado</h2>
        <div className='grid gap-4 md:grid-cols-2'>
          <label className='flex flex-col gap-1'><span className={labelClass}>Dados do cliente *</span>
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
            <select disabled={locked} value={header.fornecedor_uuid} onChange={(e) => setHeader((h) => ({ ...h, fornecedor_uuid: e.target.value }))} className={inputClass} required>
              <option value=''></option>{suppliers.map((supplier) => <option key={supplier.uuid} value={supplier.uuid}>{supplier.razao_social}</option>)}
            </select></label>
          <label className='flex flex-col gap-1'><span className={labelClass}>Número de NFE</span>
            <input disabled={locked} value={header.numero_nfe} onChange={(e) => setHeader((h) => ({ ...h, numero_nfe: e.target.value }))} maxLength={120} className={inputClass} /></label>
          <label className='flex flex-col gap-1'><span className={labelClass}>Data de abertura</span>
            <input disabled={locked} type='date' value={header.data} onChange={(e) => setHeader((h) => ({ ...h, data: e.target.value }))} className={inputClass} /></label>
          <label className='flex flex-col gap-1 md:col-span-2'><span className={labelClass}>Observações</span>
            <textarea disabled={locked} value={header.observacao} onChange={(e) => setHeader((h) => ({ ...h, observacao: e.target.value }))} rows={3} className={`${inputClass} resize-y`} /></label>
        </div>
      </section>

      <section className='rounded-lg border border-slate-200 bg-white p-5 shadow-sm'>
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='text-lg font-semibold text-slate-900'>Itens</h2>
          {items.length === 1 && <AddItemButton disabled={locked} onClick={addItem} />}
        </div>
        <div className='space-y-4'>
          {items.map((item, index) => {
            const calculated = previewSacItem({ quantidade: item.quantidade, valor_unitario: item.valor_unitario });
            return (
              <div key={item.uuid} className='rounded-lg border border-slate-200 p-4'>
                <div className='mb-3 flex justify-between'>
                  <strong className='text-sm text-slate-800'>Linha {index + 1}</strong>
                  <button type='button' aria-label={`Remover linha ${index + 1}`} disabled={items.length === 1 || locked}
                    onClick={() => setItems((current) => current.filter((entry) => entry.uuid !== item.uuid))}
                    className='rounded-md p-2 text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40'>
                    <Trash2 className='h-4 w-4' />
                  </button>
                </div>
                <div className='grid gap-3 md:grid-cols-4'>
                  <label className='flex flex-col gap-1'><span className={labelClass}>Produto cadastrado</span>
                    <select disabled={locked} value={item.produto_uuid} onChange={(e) => chooseProduct(item.uuid, e.target.value)} className={inputClass}>
                      <option value=''></option>{products.map((product) => <option key={product.uuid} value={product.uuid}>{product.codigo ? `${product.codigo} — ` : ''}{product.descricao}</option>)}
                    </select></label>
                  <label className='flex flex-col gap-1'><span className={labelClass}>COD *</span>
                    <input disabled={locked} value={item.codigo} onChange={(e) => updateItem(item.uuid, { codigo: e.target.value })} maxLength={120} className={inputClass} required /></label>
                  <label className='flex flex-col gap-1'><span className={labelClass}>QUANT *</span>
                    <input disabled={locked} type='number' min='0' step='0.001' value={item.quantidade} onChange={(e) => updateItem(item.uuid, { quantidade: e.target.value })} className={inputClass} required /></label>
                  <label className='flex flex-col gap-1'><span className={labelClass}>VL UNI. (NF) *</span>
                    <InputMoney disabled={locked} value={item.valor_unitario} onChange={(value) => updateItem(item.uuid, { valor_unitario: value })} /></label>
                  <label className='flex flex-col gap-1 md:col-span-3'><span className={labelClass}>MOTIVO *</span>
                    <input disabled={locked} value={item.motivo} onChange={(e) => updateItem(item.uuid, { motivo: e.target.value })} maxLength={255} className={inputClass} required /></label>
                  <div className='flex items-end'>
                    <div className='w-full rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700'>
                      <span className='block text-xs text-slate-600'>VL. TOTAL NF</span>
                      <strong>{BRL.format(moneyForDisplay(calculated.valor_total))}</strong>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className='mt-5 flex justify-end border-t border-slate-200 pt-4 text-right'>
          <div>
            <span className='block text-xs text-slate-600'>TOTAL</span>
            <strong className='text-lg text-slate-900'>{BRL.format(moneyForDisplay(total))}</strong>
          </div>
        </div>
        {items.length > 1 && <div className='mt-4 flex justify-end'><AddItemButton disabled={locked} onClick={addItem} /></div>}
      </section>

      <div className='flex justify-end gap-3'>
        <button type='button' onClick={() => navigate(uuid ? `/sac/${uuid}` : '/sac')} className='min-h-11 rounded-lg border border-slate-300 px-5 text-sm font-medium text-slate-700'>Voltar</button>
        <button type='submit' disabled={loading || locked || (isEdit && version == null)} className='min-h-11 rounded-lg bg-primary px-5 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60'>{loading ? 'Salvando...' : 'Salvar chamado'}</button>
      </div>
    </form>
  );
}

function AddItemButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return <button type='button' disabled={disabled} onClick={onClick} className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'>
    <Plus className='h-4 w-4' />Adicionar linha
  </button>;
}
