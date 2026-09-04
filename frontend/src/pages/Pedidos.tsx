import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, EllipsisVertical, Plus } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { fetchOrders, updateOrderStatus } from '@/services/orders.service';
import {
  orderStatusLabel, orderStatusColor, orderOrigemLabel, orderOrigemColor,
  type Order, type OrderStatus, type OrderOrigem,
} from '@/types';
import { moneyForDisplay } from '@/lib/decimal';
import { formatDate } from '@/lib/format';
import { Can } from '@/components/Can';
import { useAuth } from '@/hooks/useAuth';
import { canCancelarPedido } from '@/lib/orderPermissions';
import { getApiErrorMessage } from '@/lib/errors';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Pedidos() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [origemFilter, setOrigemFilter] = useState<OrderOrigem | ''>('');
  const [search, setSearch] = useState('');
  const [novoMenuAberto, setNovoMenuAberto] = useState(false);
  const novoMenuRef = useRef<HTMLDivElement>(null);
  const [menuPedidoUuid, setMenuPedidoUuid] = useState<string | null>(null);
  const [actionUuid, setActionUuid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      fetchOrders({
        ...params,
        status: statusFilter || undefined,
        origem: origemFilter || undefined,
        search: search || undefined,
      }),
    [statusFilter, origemFilter, search],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Order>({ fetcher });

  useEffect(() => {
    if (!novoMenuAberto) return;
    function handleClickFora(event: MouseEvent) {
      if (!novoMenuRef.current?.contains(event.target as Node)) setNovoMenuAberto(false);
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [novoMenuAberto]);

  async function cancelarPedido(order: Order) {
    if (!window.confirm('Cancelar este pedido? Essa ação não pode ser desfeita.')) return;
    setMenuPedidoUuid(null);
    setActionUuid(order.uuid);
    setActionError(null);
    try {
      await updateOrderStatus(order.uuid, 'cancelado', order.version);
      reload();
    } catch (reason) {
      setActionError(getApiErrorMessage(reason));
      reload();
    } finally {
      setActionUuid(null);
    }
  }

  const columns = [
    {
      key: 'numero',
      header: 'Nº',
      cell: (row: Order) => (
        <span className='font-mono font-medium'>
          {row.numero_pedido != null ? `#${row.numero_pedido}` : '—'}
        </span>
      ),
      className: 'w-20',
    },
    {
      key: 'origem',
      header: 'Origem',
      cell: (row: Order) => {
        const origem = row.origem ?? 'interno';
        return (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${orderOrigemColor[origem]}`}>
            {origem === 'externo' && row.sistema_origem ? row.sistema_origem : orderOrigemLabel[origem]}
          </span>
        );
      },
    },
    {
      key: 'cliente_id',
      header: 'Cliente',
      cell: (row: Order) => row.cliente?.razao_social ?? '—',
    },
    {
      key: 'data',
      header: 'Data',
      cell: (row: Order) => formatDate(row.data),
    },
    {
      key: 'total',
      header: 'Total s/ Imposto',
      cell: (row: Order) =>
        row.total_sem_imposto != null ? BRL.format(moneyForDisplay(row.total_sem_imposto)) : '—',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: Order) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusColor[row.status]}`}>
          {orderStatusLabel[row.status]}
        </span>
      ),
    },
    {
      key: 'acoes',
      header: 'Ações',
      cell: (row: Order) => (
        <OrderActionsMenu
          order={row}
          open={menuPedidoUuid === row.uuid}
          busy={actionUuid === row.uuid}
          canDuplicate={hasPermission('pedidos.criar')}
          canCancel={canCancelarPedido(hasPermission, row.status)}
          onToggle={() => setMenuPedidoUuid((current) => current === row.uuid ? null : row.uuid)}
          onClose={() => setMenuPedidoUuid(null)}
          onDetails={() => navigate(`/pedidos/${row.uuid}`)}
          onDuplicate={() => navigate(
            (row.origem ?? 'interno') === 'externo'
              ? `/pedidos/externo/novo?duplicar=${row.uuid}`
              : `/pedidos/novo?duplicar=${row.uuid}`,
          )}
          onCancel={() => void cancelarPedido(row)}
        />
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div className='flex flex-wrap items-center gap-3'>
          <input
            type='search'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder='Cliente, CNPJ, número ou sistema'
            aria-label='Buscar pedidos'
            className='min-h-11 min-w-64 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
            aria-label='Filtrar por status'
            className='rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40'
          >
            <option value=''>Todos os status</option>
            {(Object.keys(orderStatusLabel) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>{orderStatusLabel[s]}</option>
            ))}
          </select>
          <select
            value={origemFilter}
            onChange={(e) => setOrigemFilter(e.target.value as OrderOrigem | '')}
            aria-label='Filtrar por origem'
            className='rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40'
          >
            <option value=''>Todas as origens</option>
            {(Object.keys(orderOrigemLabel) as OrderOrigem[]).map((o) => (
              <option key={o} value={o}>{orderOrigemLabel[o]}</option>
            ))}
          </select>
        </div>

        {/* O menu inteiro some sem `pedidos.criar`: as duas opções levam a rotas
            que exigem a mesma permissão. */}
        <Can permission='pedidos.criar'>
        <div ref={novoMenuRef} className='relative'>
          <button
            type='button'
            onClick={() => setNovoMenuAberto((open) => !open)}
            aria-haspopup='menu'
            aria-expanded={novoMenuAberto}
            className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 transition-colors'
          >
            <Plus className='h-4 w-4' />
            Novo Pedido
            <ChevronDown className='h-4 w-4' />
          </button>
          {novoMenuAberto && (
            <div role='menu' className='absolute right-0 z-10 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg'>
              <button
                type='button'
                role='menuitem'
                onClick={() => navigate('/pedidos/novo')}
                className='block w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50'
              >
                <span className='block font-medium'>Pedido interno</span>
                <span className='block text-xs text-slate-500'>Digitado aqui, com itens</span>
              </button>
              <button
                type='button'
                role='menuitem'
                onClick={() => navigate('/pedidos/externo/novo')}
                className='block w-full border-t border-slate-100 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50'
              >
                <span className='block font-medium'>Pedido externo</span>
                <span className='block text-xs text-slate-500'>Digitado em outro sistema</span>
              </button>
            </div>
          )}
        </div>
        </Can>
      </div>

      {actionError && <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800'>{actionError}</div>}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        error={error}
        onRetry={reload}
        meta={meta ?? undefined}
        onPageChange={goToPage}
        emptyTitle='Nenhum pedido encontrado'
        emptyDescription='Clique em "Novo Pedido" para começar.'
      />
    </div>
  );
}

function OrderActionsMenu({
  order, open, busy, canDuplicate, canCancel, onToggle, onClose, onDetails, onDuplicate, onCancel,
}: {
  order: Order; open: boolean; busy: boolean; canDuplicate: boolean; canCancel: boolean;
  onToggle: () => void; onClose: () => void; onDetails: () => void; onDuplicate: () => void; onCancel: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 208;
    const height = 8 + 40 * (1 + Number(canDuplicate) + Number(canCancel));
    setPosition({
      top: rect.bottom + 4 + height <= window.innerHeight
        ? rect.bottom + 4
        : Math.max(8, rect.top - height - 4),
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    });
    const first = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
    const closeOnViewportChange = () => onCloseRef.current();
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      window.cancelAnimationFrame(first);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [canCancel, canDuplicate, open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) onCloseRef.current();
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  function choose(action: () => void) {
    onClose();
    action();
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault(); onClose(); buttonRef.current?.focus(); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !items.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  const numero = order.numero_pedido != null ? ` #${order.numero_pedido}` : '';
  return (
    <>
      <button ref={buttonRef} type='button' disabled={busy} onClick={onToggle} aria-haspopup='menu' aria-expanded={open} aria-label={`Opções do pedido${numero}`} title='Opções do pedido' className='inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50'>
        <EllipsisVertical className='h-5 w-5' />
      </button>
      {open && createPortal(
        <div ref={menuRef} role='menu' onKeyDown={handleMenuKeyDown} style={{ position: 'fixed', top: position.top, left: position.left }} className='z-50 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg'>
          <button type='button' role='menuitem' onClick={() => choose(onDetails)} className='block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none'>Ver detalhes</button>
          {canDuplicate && <button type='button' role='menuitem' onClick={() => choose(onDuplicate)} className='block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none'>Duplicar</button>}
          {canCancel && <button type='button' role='menuitem' onClick={() => choose(onCancel)} className='block w-full px-4 py-2 text-left text-sm text-red-700 hover:bg-red-50 focus:bg-red-50 focus:outline-none'>Cancelar pedido</button>}
        </div>,
        document.body,
      )}
    </>
  );
}
