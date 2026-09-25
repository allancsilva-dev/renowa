/**
 * Detecção de item repetido dentro do MESMO pedido.
 *
 * Espelha a guarda do backend (`assertCodigosItensUnicos`, em
 * `orders/order-write.ts`) e os índices `uq_itens_pedido_codigo_manual` e
 * `uq_itens_pedido_produto` (0044). Aqui é só antecipação: dava para digitar 22
 * linhas com o mesmo código e só descobrir o problema no 409 depois de salvar —
 * e o banner de erro do form é global, não diz QUAL linha corrigir.
 *
 * São duas regras independentes, como no backend:
 * - o código digitado não pode repetir;
 * - o produto do catálogo não pode repetir, MESMO com códigos diferentes.
 *   `chooseProduct` preenche o código com o do produto, mas o usuário pode
 *   editá-lo; duas linhas do mesmo produto com códigos editados passavam aqui
 *   e voltavam 409 do backend (BACKLOG-0097).
 *
 * Item sem código e sem produto (só descrição digitada) fica de fora: é o item
 * avulso, e repetir descrição é legítimo.
 */
export interface ItemComCodigo {
  uuid: string;
  produto_uuid: string;
  codigo_manual: string;
}

export type MotivoRepeticao = 'codigo' | 'produto';

export interface CodigosDuplicados {
  /** uuid de cada REPETIÇÃO — a primeira ocorrência do grupo fica de fora. */
  uuids: Set<string>;
  /** Por que cada linha em `uuids` foi marcada; código vence quando os dois repetem. */
  motivos: Map<string, MotivoRepeticao>;
  /** Códigos repetidos, na ordem em que aparecem, para a mensagem do usuário. */
  codigos: string[];
  /** Há ao menos uma linha repetindo produto (sem repetir código). */
  produtoRepetido: boolean;
}

export function encontrarCodigosDuplicados(items: ItemComCodigo[]): CodigosDuplicados {
  const codigosVistos = new Set<string>();
  const produtosVistos = new Set<string>();
  const motivos = new Map<string, MotivoRepeticao>();
  const codigos: string[] = [];

  for (const item of items) {
    const codigo = item.codigo_manual.trim();
    const produto = item.produto_uuid;

    // Marcar a primeira ocorrência também deixaria o usuário sem saber qual
    // das duas linhas é a "certa". Só a repetição fica em vermelho.
    if (codigo && codigosVistos.has(codigo)) {
      motivos.set(item.uuid, 'codigo');
      if (!codigos.includes(codigo)) codigos.push(codigo);
    } else if (produto && produtosVistos.has(produto)) {
      motivos.set(item.uuid, 'produto');
    }

    if (codigo) codigosVistos.add(codigo);
    if (produto) produtosVistos.add(produto);
  }

  return {
    uuids: new Set(motivos.keys()),
    motivos,
    codigos,
    produtoRepetido: [...motivos.values()].includes('produto'),
  };
}

/** Texto da linha marcada, conforme o que repetiu. */
export function mensagemLinhaDuplicada(motivo: MotivoRepeticao): string {
  return motivo === 'codigo'
    ? 'Este item já está no pedido. Cada código só pode aparecer uma vez.'
    : 'Este produto já está em outro item. Cada produto só pode aparecer uma vez.';
}

/** Mensagem do banner de erro. `null` quando não há repetição. */
export function mensagemCodigosDuplicados(duplicados: CodigosDuplicados): string | null {
  if (duplicados.uuids.size === 0) return null;
  const partes: string[] = [];
  if (duplicados.codigos.length) {
    partes.push(`Há itens com o mesmo código: ${duplicados.codigos.join(', ')}. `
      + 'Cada código só pode aparecer uma vez no pedido.');
  }
  if (duplicados.produtoRepetido) {
    partes.push('Há itens repetidos no pedido. Cada produto só pode aparecer uma vez.');
  }
  return partes.join(' ');
}
