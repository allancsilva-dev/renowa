// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InputMoney } from './InputMoney';

afterEach(cleanup);

describe('InputMoney', () => {
  function ControlledInput({ initial = null, onChange = vi.fn() }: { initial?: number | null; onChange?: (value: number | null) => void }) {
    const [value, setValue] = useState(initial);
    return <InputMoney aria-label='Valor' value={value} onChange={(next) => { setValue(next); onChange(next); }} />;
  }

  it.each([
    ['1,005', 1.01, '1,01'],
    ['1,004', 1, '1,00'],
    ['1234.56', 1234.56, '1.234,56'],
    ['1.234,56', 1234.56, '1.234,56'],
    [' R$ 1.234,567 ', 1234.57, '1.234,57'],
    ['0', 0, '0,00'],
  ])('interpreta e normaliza %s', (typed, expected, displayed) => {
    const onChange = vi.fn();
    render(<ControlledInput onChange={onChange} />);
    const input = screen.getByLabelText('Valor');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: typed } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(expected);
    expect(input).toHaveValue(displayed);
  });

  it.each(['', '1,2x', '1,2,3', 'abc', '1.23.4'])('rejeita entrada inválida %j', (typed) => {
    const onChange = vi.fn();
    render(<ControlledInput initial={10} onChange={onChange} />);
    const input = screen.getByLabelText('Valor');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: typed } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveValue('');
  });

  it('normaliza valores recebidos programaticamente para exibição', () => {
    render(<InputMoney aria-label='Valor' value={1.005} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Valor')).toHaveValue('1,01');
  });
});
