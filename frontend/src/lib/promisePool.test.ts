import { describe, expect, it } from 'vitest';
import { mapComLimite } from './promisePool';

/** Resolve no próximo tick — dá chance de outro worker entrar em voo. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('mapComLimite', () => {
  it('preserva a ordem da entrada, mesmo quando o mais lento vem primeiro', async () => {
    const atrasos = [30, 0, 10, 0, 20];
    const resultado = await mapComLimite(atrasos, 2, async (ms, i) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return i;
    });

    expect(resultado).toEqual([0, 1, 2, 3, 4]);
  });

  /**
   * A razão de existir do utilitário: sem o teto, os 20 disparam juntos e o
   * servidor devolve 429 do 100º em diante.
   */
  it('nunca passa do limite de chamadas em voo', async () => {
    let emVoo = 0;
    let pico = 0;

    await mapComLimite(Array.from({ length: 20 }, (_, i) => i), 6, async (n) => {
      emVoo += 1;
      pico = Math.max(pico, emVoo);
      await tick();
      emVoo -= 1;
      return n;
    });

    expect(pico).toBe(6);
    expect(emVoo).toBe(0);
  });

  it('não abre worker sobrando quando a lista é menor que o limite', async () => {
    let pico = 0;
    let emVoo = 0;

    await mapComLimite([1, 2], 6, async (n) => {
      emVoo += 1;
      pico = Math.max(pico, emVoo);
      await tick();
      emVoo -= 1;
      return n;
    });

    expect(pico).toBe(2);
  });

  it('devolve lista vazia sem chamar a função', async () => {
    let chamadas = 0;
    const resultado = await mapComLimite([], 6, async () => { chamadas += 1; return 1; });

    expect(resultado).toEqual([]);
    expect(chamadas).toBe(0);
  });

  it('propaga a rejeição', async () => {
    await expect(
      mapComLimite([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('falhou');
        return n;
      }),
    ).rejects.toThrow('falhou');
  });
});
