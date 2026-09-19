import { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { normalizeMoney } from '@/lib/decimal';

interface InputMoneyProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  value: number | null;
  onChange: (value: number | null) => void;
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
  let cleaned = input.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!cleaned) return null;
  if (cleaned.includes(',')) {
    if (!/^[+-]?(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?$/.test(cleaned)) return null;
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    const isDecimal = /^[+-]?\d+(?:\.\d+)?$/.test(cleaned);
    // Ponto seguido de grupos de 3 dígitos é milhar (pt-BR): 1.500 → 1500. Zero à
    // esquerda não abre grupo de milhar, então 0.500 segue decimal.
    const isGroupedInteger = /^[+-]?[1-9]\d{0,2}(?:\.\d{3})+$/.test(cleaned);
    if (!isDecimal && !isGroupedInteger) return null;
    if (isGroupedInteger) cleaned = cleaned.replace(/\./g, '');
  }
  try {
    return normalizeMoney(new Decimal(cleaned));
  } catch {
    return null;
  }
}

export function InputMoney({
  value,
  onChange,
  placeholder = 'R$ 0,00',
  className,
  disabled,
  required,
  ...inputProps
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
      setDisplayValue(String(normalizeMoney(value)).replace('.', ','));
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
      {...inputProps}
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
