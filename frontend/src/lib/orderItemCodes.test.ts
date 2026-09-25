import { describe, expect, it } from 'vitest';
import {
  encontrarCodigosDuplicados, mensagemCodigosDuplicados, mensagemLinhaDuplicada, type ItemComCodigo,
} from './orderItemCodes';

const item = (uuid: string, codigo_manual = '', produto_uuid = ''): ItemComCodigo =>
  ({ uuid, codigo_manual, produto_uuid });

describe('encontrarCodigosDuplicados', () => {
  it('marca só a repetição, não a primeira ocorrência', () => {
    const { uuids, codigos } = encontrarCodigosDuplicados([
      item('a', 'ABC'), item('b', 'XYZ'), item('c', 'ABC'),
    ]);

    expect([...uuids]).toEqual(['c']);
    expect(codigos).toEqual(['ABC']);
  });

  it('compara com trim, como o backend', () => {
    const { uuids } = encontrarCodigosDuplicados([item('a', 'ABC'), item('b', '  ABC  ')]);

    expect(uuids.has('b')).toBe(true);
  });

  it('cai no produto quando o item cadastrado não tem código', () => {
    const { uuids, codigos } = encontrarCodigosDuplicados([
      item('a', '', 'prod-1'), item('b', '', 'prod-1'),
    ]);

    expect(uuids.has('b')).toBe(true);
    // Sem código digitado não há texto para citar na mensagem.
    expect(codigos).toEqual([]);
  });

  it('não confunde código digitado com uuid de produto', () => {
    const { uuids } = encontrarCodigosDuplicados([item('a', 'prod-1'), item('b', '', 'prod-1')]);

    expect(uuids.size).toBe(0);
  });

  it('ignora item só com descrição — repetir descrição é legítimo', () => {
    const { uuids } = encontrarCodigosDuplicados([item('a'), item('b'), item('c')]);

    expect(uuids.size).toBe(0);
  });

  it('lista cada código repetido uma vez só', () => {
    const { uuids, codigos } = encontrarCodigosDuplicados([
      item('a', 'ABC'), item('b', 'ABC'), item('c', 'ABC'), item('d', 'XYZ'), item('e', 'XYZ'),
    ]);

    expect(uuids.size).toBe(3);
    expect(codigos).toEqual(['ABC', 'XYZ']);
  });
});

describe('encontrarCodigosDuplicados — produto repetido (BACKLOG-0097)', () => {
  it('mesmo produto com códigos editados diferentes é repetição de produto', () => {
    const d = encontrarCodigosDuplicados([item('a', 'QAA', 'prod-1'), item('b', 'QAB', 'prod-1')]);

    expect([...d.uuids]).toEqual(['b']);
    expect(d.motivos.get('b')).toBe('produto');
    expect(d.codigos).toEqual([]);
    expect(d.produtoRepetido).toBe(true);
  });

  it('mesmo código em produtos diferentes continua sendo repetição de código', () => {
    const d = encontrarCodigosDuplicados([item('a', 'ABC', 'prod-1'), item('b', 'ABC', 'prod-2')]);

    expect(d.motivos.get('b')).toBe('codigo');
    expect(d.produtoRepetido).toBe(false);
  });

  it('quando código e produto repetem, a linha é marcada uma vez, por código', () => {
    const d = encontrarCodigosDuplicados([item('a', 'ABC', 'prod-1'), item('b', 'ABC', 'prod-1')]);

    expect(d.uuids.size).toBe(1);
    expect(d.motivos.get('b')).toBe('codigo');
  });

  it('texto da linha diz o que repetiu', () => {
    expect(mensagemLinhaDuplicada('produto')).toContain('Cada produto');
    expect(mensagemLinhaDuplicada('codigo')).toContain('Cada código');
  });
});

describe('mensagemCodigosDuplicados', () => {
  it('cita código e produto quando os dois repetem em linhas diferentes', () => {
    const mensagem = mensagemCodigosDuplicados(encontrarCodigosDuplicados([
      item('a', 'ABC'), item('b', 'ABC'), item('c', 'X1', 'prod-1'), item('d', 'X2', 'prod-1'),
    ]));

    expect(mensagem).toContain('ABC');
    expect(mensagem).toContain('Cada produto');
  });

  it('devolve null sem repetição', () => {
    expect(mensagemCodigosDuplicados(encontrarCodigosDuplicados([item('a', 'ABC')]))).toBeNull();
  });

  it('cita os códigos repetidos', () => {
    const mensagem = mensagemCodigosDuplicados(
      encontrarCodigosDuplicados([item('a', 'ABC'), item('b', 'ABC')]),
    );

    expect(mensagem).toContain('ABC');
  });

  it('sem código para citar, avisa em termos de produto', () => {
    const mensagem = mensagemCodigosDuplicados(
      encontrarCodigosDuplicados([item('a', '', 'prod-1'), item('b', '', 'prod-1')]),
    );

    expect(mensagem).toBe('Há itens repetidos no pedido. Cada produto só pode aparecer uma vez.');
  });
});
