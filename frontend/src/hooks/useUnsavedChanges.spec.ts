// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useUnsavedChanges } from './useUnsavedChanges';

function unloadCancelled(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useUnsavedChanges', () => {
  it('fica limpo no snapshot inicial e sujo quando ele muda', () => {
    const { result, rerender } = renderHook(({ snap }) => useUnsavedChanges(snap), { initialProps: { snap: 'a' } });
    expect(result.current.isDirty).toBe(false);

    rerender({ snap: 'b' });
    expect(result.current.isDirty).toBe(true);

    rerender({ snap: 'a' });
    expect(result.current.isDirty).toBe(false);
  });

  it('markClean troca o baseline pelo snapshot informado e é estável', () => {
    const { result, rerender } = renderHook(({ snap }) => useUnsavedChanges(snap), { initialProps: { snap: 'a' } });
    const markClean = result.current.markClean;

    rerender({ snap: 'b' });
    act(() => result.current.markClean('b'));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.markClean).toBe(markClean);

    // Digitado depois do que foi gravado continua pendente.
    act(() => result.current.markClean('a'));
    expect(result.current.isDirty).toBe(true);
  });

  it('desabilitado nunca fica sujo', () => {
    const { result, rerender } = renderHook(({ snap, on }) => useUnsavedChanges(snap, on), {
      initialProps: { snap: 'a', on: false },
    });
    rerender({ snap: 'b', on: false });
    expect(result.current.isDirty).toBe(false);
  });

  it('só pede confirmação ao sair enquanto há edição pendente', () => {
    const { rerender, unmount } = renderHook(({ snap }) => useUnsavedChanges(snap), { initialProps: { snap: 'a' } });
    expect(unloadCancelled()).toBe(false);

    rerender({ snap: 'b' });
    expect(unloadCancelled()).toBe(true);

    unmount();
    expect(unloadCancelled()).toBe(false);
  });
});
