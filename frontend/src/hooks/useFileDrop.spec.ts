// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useFileDrop } from './useFileDrop';

afterEach(cleanup);

function dispatch(type: 'dragover' | 'drop') {
  const event = new Event(type, { bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe('useFileDrop — proteção fora da zona', () => {
  it('impede o navegador de abrir arquivo solto fora da área enquanto montado, mesmo desabilitado', () => {
    const { unmount } = renderHook(() => useFileDrop(() => {}, { disabled: true }));

    expect(dispatch('dragover').defaultPrevented).toBe(true);
    expect(dispatch('drop').defaultPrevented).toBe(true);

    unmount();
    expect(dispatch('drop').defaultPrevented).toBe(false);
  });
});
