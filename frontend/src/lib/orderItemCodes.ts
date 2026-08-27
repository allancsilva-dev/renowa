/**
 * Detecção de item repetido dentro do MESMO pedido.
 *
 * Espelha a guarda do backend (`assertCodigosItensUnicos`, em
 * `orders/order-write.ts`) e o índice `uq_itens_pedido_codigo_manual` (0044).
 * Aqui é só antecipação: dava para digitar 22 linhas com o mesmo código e só
 * descobrir o problema no 409 depois de salvar — e o banner de erro do form é
 * global, não diz QUAL linha corrigir.
 *
 * A chave é o código digitado; na falta dele, o produto escolhido. O form
 * preenche `codigo_manual` com o código do produto ao selecionar um do catálogo
 * (`chooseProduct`), então na prática as duas formas convergem — o fallback
 * cobre o produto cadastrado SEM código.
 *
 * Item sem código e sem produto (só descrição digitada) fica de fora: é o item
 * avulso, e repetir descrição é legítimo.
 */
export interface ItemComCodigo {
  uuid: string;
  produto_uuid: string;
  codigo_manual: string;
}

export interface CodigosDuplicados {
  /** uuid de cada REPETIÇÃO — a primeira ocorrência do grupo fica de fora. */
  uuids: Set<string>;
  /** Códigos repetidos, na ordem em que aparecem, para a mensagem do usuário. */
  codigos: string[];
}

export function encontrarCodigosDuplicados(items: ItemComCodigo[]): CodigosDuplicados {
  const vistos = new Set<string>();
  const uuids = new Set<string>();
  const codigos: string[] = [];

  for (const item of items) {
    const codigo = item.codigo_manual.trim();
    // Prefixo para não confundir um código digitado com um uuid de produto.
    const chave = codigo ? `codigo:${codigo}` : item.produto_uuid ? `produto:${item.produto_uuid}` : null;
    if (!chave) continue;

    if (vistos.has(chave)) {
      uuids.add(item.uuid);
      // Marcar a primeira ocorrência também deixaria o usuário sem saber qual
      // das duas linhas é a "certa". Só a repetição fica em vermelho.
      if (codigo && !codigos.includes(codigo)) codigos.push(codigo);
      continue;
    }
    vistos.add(chave);
  }

  return { uuids, codigos };
}

/** Mensagem do banner de erro. `null` quando não há repetição. */
export function mensagemCodigosDuplicados(duplicados: CodigosDuplicados): string | null {
  if (duplicados.uuids.size === 0) return null;
  if (duplicados.codigos.length === 0) {
    return 'Há itens repetidos no pedido. Cada produto só pode aparecer uma vez.';
  }
  return `Há itens com o mesmo código: ${duplicados.codigos.join(', ')}. `
    + 'Cada código só pode aparecer uma vez no pedido.';
}
