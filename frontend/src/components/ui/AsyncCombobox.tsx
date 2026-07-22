import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Loader2, SearchX } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

export interface AsyncComboboxOption {
  value: string;
  label: string;
  /** Texto secundário exibido junto ao label (ex.: CNPJ). */
  description?: string;
  /** Payload arbitrário associado à opção (ex.: entidade completa), devolvido no `onChange`. */
  data?: unknown;
}

export interface AsyncComboboxFetchResult {
  options: AsyncComboboxOption[];
  hasMore: boolean;
}

export interface AsyncComboboxProps {
  id?: string;
  /** Valor selecionado (uuid). `null` quando nada está selecionado. */
  value: string | null;
  /**
   * Rótulo do valor selecionado — usado para exibir o texto no campo sem
   * depender de o item estar na página atualmente carregada (ex.: edição).
   */
  displayValue?: string | null;
  onChange: (value: string | null, option: AsyncComboboxOption | null) => void;
  /** Busca paginada — a página 1 é buscada ao abrir/alterar o texto (com debounce). */
  fetcher: (search: string, page: number) => Promise<AsyncComboboxFetchResult>;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  emptyMessage?: string;
  errorMessage?: string;
  className?: string;
  debounceMs?: number;
}

const DEFAULT_INPUT_CLASS =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-9 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 disabled:bg-slate-50 disabled:text-slate-400';

export function AsyncCombobox({
  id,
  value,
  displayValue,
  onChange,
  fetcher,
  placeholder = 'Buscar...',
  disabled = false,
  required = false,
  ariaLabel,
  emptyMessage = 'Nenhum resultado encontrado.',
  errorMessage = 'Não foi possível carregar os resultados.',
  className,
  debounceMs = 300,
}: AsyncComboboxProps) {
  const reactId = useId();
  const listboxId = `${id ?? reactId}-listbox`;

  const [inputText, setInputText] = useState(displayValue ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<AsyncComboboxOption[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const debouncedText = useDebounce(inputText, debounceMs);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  // Mantém o texto exibido sincronizado quando o `displayValue` muda por
  // ação do componente pai (ex.: carregamento de registro para edição ou
  // limpeza programática do campo) — nunca enquanto o dropdown está aberto,
  // para não sobrescrever o que o usuário está digitando. A restauração do
  // texto ao selecionar/cancelar é feita diretamente pelos handlers (evita
  // depender de um round-trip assíncrono do estado do componente pai).
  useEffect(() => {
    if (!isOpenRef.current) setInputText(displayValue ?? '');
  }, [displayValue]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    setError(false);
    setActiveIndex(-1);
    fetcher(debouncedText, 1)
      .then((result) => {
        if (!active) return;
        setOptions(result.options);
        setHasMore(result.hasMore);
        setPage(1);
      })
      .catch(() => {
        if (!active) return;
        setOptions([]);
        setHasMore(false);
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedText, isOpen]);

  function open() {
    if (disabled) return;
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function selectOption(option: AsyncComboboxOption) {
    onChange(option.value, option);
    setInputText(option.label);
    close();
  }

  function handleInputChange(text: string) {
    setInputText(text);
    open();
    if (value !== null) onChange(null, null);
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    const currentRequest = ++requestId.current;
    setLoadingMore(true);
    try {
      const result = await fetcher(debouncedText, nextPage);
      if (currentRequest !== requestId.current) return;
      setOptions((current) => [...current, ...result.options]);
      setHasMore(result.hasMore);
      setPage(nextPage);
    } catch {
      // falha ao paginar — mantém lista atual, sem bloquear a UI
    } finally {
      setLoadingMore(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) {
        open();
        return;
      }
      setActiveIndex((current) => (options.length === 0 ? -1 : Math.min(current + 1, options.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) return;
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && options[activeIndex]) {
        event.preventDefault();
        selectOption(options[activeIndex]);
      }
    } else if (event.key === 'Escape') {
      if (isOpen) {
        event.preventDefault();
        setInputText(displayValue ?? '');
        close();
      }
    }
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (containerRef.current && next && containerRef.current.contains(next)) return;
    setInputText(displayValue ?? '');
    close();
  }

  const activeOptionId = activeIndex >= 0 && options[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined;

  const showEmpty = useMemo(
    () => isOpen && !loading && !error && options.length === 0,
    [isOpen, loading, error, options.length],
  );

  return (
    <div ref={containerRef} className='relative' onBlur={handleBlur}>
      <div className='relative'>
        <input
          id={id}
          type='text'
          role='combobox'
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete='list'
          aria-activedescendant={activeOptionId}
          aria-label={ariaLabel}
          aria-required={required}
          value={inputText}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={open}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete='off'
          className={className ?? DEFAULT_INPUT_CLASS}
        />
        <ChevronDown
          aria-hidden='true'
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform',
            isOpen && 'rotate-180',
          )}
        />
      </div>

      {isOpen && (
        <div className='absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg'>
          <ul id={listboxId} role='listbox' className='max-h-60 overflow-y-auto py-1'>
            {loading && (
              <li className='flex items-center gap-2 px-3 py-3 text-sm text-slate-500' role='presentation'>
                <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
                Carregando...
              </li>
            )}
            {!loading && error && (
              <li className='px-3 py-3' role='presentation'>
                <div className='flex items-center gap-2 text-sm text-destructive'>
                  <AlertTriangle className='h-4 w-4 shrink-0' aria-hidden='true' />
                  {errorMessage}
                </div>
              </li>
            )}
            {showEmpty && (
              <li className='px-3 py-3' role='presentation'>
                <div className='flex items-center gap-2 text-sm text-slate-500'>
                  <SearchX className='h-4 w-4 shrink-0 text-slate-300' aria-hidden='true' />
                  {emptyMessage}
                </div>
              </li>
            )}
            {!loading && !error && options.map((option, index) => (
              <li
                key={option.value}
                id={`${listboxId}-option-${index}`}
                role='option'
                aria-selected={option.value === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'cursor-pointer px-3 py-2 text-sm text-slate-800',
                  index === activeIndex ? 'bg-primary/10 text-primary-800' : 'hover:bg-slate-50',
                )}
              >
                <p className='font-medium'>{option.label}</p>
                {option.description && <p className='text-xs text-slate-500'>{option.description}</p>}
              </li>
            ))}
          </ul>
          {!loading && !error && hasMore && (
            <button
              type='button'
              onMouseDown={(event) => event.preventDefault()}
              onClick={loadMore}
              disabled={loadingMore}
              className='block w-full border-t border-slate-100 px-3 py-2 text-center text-xs font-medium text-primary hover:bg-slate-50 disabled:opacity-60'
            >
              {loadingMore ? 'Carregando...' : 'Carregar mais'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default AsyncCombobox;
