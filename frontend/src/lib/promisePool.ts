/**
 * `Promise.all` sobre uma lista de tamanho imprevisível é uma rajada: um pedido
 * com 120 produtos distintos vira 120 requisições simultâneas, o servidor
 * responde 429 do teto em diante e o resultado sai furado.
 *
 * Aqui os workers puxam de um cursor compartilhado, então nunca há mais de
 * `limite` chamadas em voo. A ordem da saída acompanha a da entrada — quem
 * chama indexa o resultado pela posição, não pela ordem de chegada.
 *
 * Rejeição de qualquer `fn` propaga como em `Promise.all`: engolir erro é
 * decisão de quem chama, não deste utilitário.
 */
export async function mapComLimite<T, R>(
  itens: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  if (itens.length === 0) return [];

  const resultados = new Array<R>(itens.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const indice = cursor++;
      if (indice >= itens.length) return;
      resultados[indice] = await fn(itens[indice], indice);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(limite, itens.length)) },
    () => worker(),
  );
  await Promise.all(workers);

  return resultados;
}
