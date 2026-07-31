// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUuidDeCriacao } from './useUuidDeCriacao';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('useUuidDeCriacao', () => {
  it('gera UUID v4', () => {
    const { result } = renderHook(() => useUuidDeCriacao());

    expect(result.current.uuid).toMatch(UUID_V4);
  });

  /**
   * A garantia inteira do hook. Gerar o uuid no submit (o que `withGeneratedUuid`
   * fazia) dava identidade NOVA a cada tentativa: o servidor não tinha como
   * reconhecer o reenvio, e o segundo clique depois de um erro criava um segundo
   * registro. Re-render não pode trocar a identidade.
   */
  it('mantém o mesmo uuid entre renders', () => {
    const { result, rerender } = renderHook(() => useUuidDeCriacao());
    const primeiro = result.current.uuid;

    rerender();
    rerender();

    expect(result.current.uuid).toBe(primeiro);
  });

  it('renovar troca a identidade — a criação seguinte é outro registro', () => {
    const { result } = renderHook(() => useUuidDeCriacao());
    const primeiro = result.current.uuid;

    act(() => result.current.renovar());

    expect(result.current.uuid).not.toBe(primeiro);
    expect(result.current.uuid).toMatch(UUID_V4);
  });
});
