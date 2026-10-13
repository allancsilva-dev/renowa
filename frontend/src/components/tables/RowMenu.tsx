import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { MoreVertical, type LucideIcon } from 'lucide-react';

export interface RowMenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  /** Ação destrutiva — texto vermelho. */
  danger?: boolean;
}

interface RowMenuProps {
  /** Nome acessível do gatilho. Descreva a linha: `Ações do pedido #42`. */
  label: string;
  items: RowMenuItem[];
}

const MENU_WIDTH = 208;
const GUTTER = 8;

/**
 * Menu "três pontinhos" de linha de tabela.
 *
 * O painel é `position: fixed`, calculado a partir do gatilho: a tabela vive
 * dentro de um contêiner com `overflow-x-auto`, que cortaria um painel
 * `absolute`. Rolar ou redimensionar fecha o menu em vez de recalcular — mais
 * simples e sem painel "flutuando" longe da linha.
 *
 * Teclado: Enter/Espaço/↓ abrem e focam o primeiro item; ↑/↓/Home/End navegam;
 * Esc e Tab fecham devolvendo o foco ao gatilho. Listeners globais só existem
 * enquanto o menu está aberto.
 */
export function RowMenu({ label, items }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const enabledItems = items.filter((item) => !item.disabled);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const left = Math.min(
      Math.max(GUTTER, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - GUTTER,
    );
    const below = rect.bottom + 4;
    const top = below + menuHeight > window.innerHeight - GUTTER && rect.top - menuHeight - 4 > GUTTER
      ? rect.top - menuHeight - 4
      : below;
    setPosition({ top, left: Math.max(GUTTER, left) });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    }
    function onViewportChange() { close(false); }

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, close]);

  function focusItem(offset: number | 'first' | 'last') {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
    if (buttons.length === 0) return;
    if (offset === 'first') { buttons[0].focus(); return; }
    if (offset === 'last') { buttons[buttons.length - 1].focus(); return; }
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(current + offset + buttons.length) % buttons.length].focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); focusItem(1); break;
      case 'ArrowUp': event.preventDefault(); focusItem(-1); break;
      case 'Home': event.preventDefault(); focusItem('first'); break;
      case 'End': event.preventDefault(); focusItem('last'); break;
      case 'Escape': event.preventDefault(); close(); break;
      case 'Tab': close(false); break;
      default: break;
    }
  }

  function onTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      setOpen(true);
    }
  }

  if (enabledItems.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type='button'
        aria-label={label}
        title={label}
        aria-haspopup='menu'
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
        className='inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100'
      >
        <MoreVertical className='h-4 w-4' aria-hidden='true' />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role='menu'
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          style={{ position: 'fixed', top: position?.top ?? -9999, left: position?.left ?? -9999, width: MENU_WIDTH }}
          className='z-50 rounded-lg border border-slate-200 bg-white py-1 shadow-lg'
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type='button'
                role='menuitem'
                disabled={item.disabled}
                onClick={() => { close(false); item.onSelect(); }}
                className={`flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm outline-none transition-colors focus:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 ${
                  item.danger ? 'text-red-700 hover:bg-red-50 focus:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {Icon && <Icon className='h-4 w-4 shrink-0' aria-hidden='true' />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
