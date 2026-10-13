import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import PrepostosCadastro from '@/pages/prepostos/PrepostosCadastro';
import PrepostosVendas from '@/pages/prepostos/PrepostosVendas';

const ABAS = [
  { id: 'cadastro', label: 'Cadastro' },
  { id: 'vendas', label: 'Vendas' },
] as const;
type Aba = (typeof ABAS)[number]['id'];

/** Duas abas; a ativa fica na URL (`?aba=vendas`) para sobreviver a reload e link. */
export default function Prepostos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const aba: Aba = searchParams.get('aba') === 'vendas' ? 'vendas' : 'cadastro';
  const tabRefs = useRef<Record<Aba, HTMLButtonElement | null>>({ cadastro: null, vendas: null });

  function select(next: Aba, focus = false) {
    setSearchParams(next === 'cadastro' ? {} : { aba: next }, { replace: true });
    if (focus) tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = ABAS.findIndex((item) => item.id === aba);
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    select(ABAS[(index + offset + ABAS.length) % ABAS.length].id, true);
  }

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-xl font-bold text-slate-900'>Prepostos</h1>
        <p className='mt-1 text-sm text-slate-500'>Representantes externos que vendem pela empresa e recebem comissão sobre as notas.</p>
      </div>

      <div role='tablist' aria-label='Prepostos' className='flex gap-1 border-b border-slate-200' onKeyDown={onKeyDown}>
        {ABAS.map((item) => {
          const selected = aba === item.id;
          return (
            <button
              key={item.id}
              ref={(el) => { tabRefs.current[item.id] = el; }}
              type='button'
              role='tab'
              id={`aba-${item.id}`}
              aria-selected={selected}
              aria-controls={`painel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(item.id)}
              className={`-mb-px min-h-11 border-b-2 px-4 text-sm font-medium transition-colors ${
                selected ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Só a aba ativa monta: a inativa não busca dados à toa. */}
      <div role='tabpanel' id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
        {aba === 'cadastro' ? <PrepostosCadastro /> : <PrepostosVendas />}
      </div>
    </div>
  );
}
