import { useState, useEffect } from 'react';

interface InputMoneyProps {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-[#2A9D8F] focus:ring-1 focus:ring-[#2A9D8F]/20 disabled:bg-slate-50 disabled:text-slate-400';

function formatToBRL(value: number | null): string {
  if (value === null || isNaN(value)) return '';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseFromInput(input: string): number | null {
  if (!input || input.trim() === '') return null;
  let cleaned = input.replace(/[R$\s]/g, '').trim();
  if (cleaned.includes(',')) {
    // Formato brasileiro: 1.500,50 → remove pontos de milhar, troca vírgula por ponto
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

export function InputMoney({
  value,
  onChange,
  placeholder = 'R$ 0,00',
  className,
  disabled,
  required,
}: InputMoneyProps) {
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(value !== null ? formatToBRL(value) : '');
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    if (value !== null) {
      setDisplayValue(String(value).replace('.', ','));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFromInput(displayValue);
    onChange(parsed);
    setDisplayValue(parsed !== null ? formatToBRL(parsed) : '');
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={(e) => setDisplayValue(e.target.value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className ?? inputCls}
      disabled={disabled}
      required={required}
    />
  );
}
