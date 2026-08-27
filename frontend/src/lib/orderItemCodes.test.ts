import { describe, expect, it } from 'vitest';
import { encontrarCodigosDuplicados, mensagemCodigosDuplicados, type ItemComCodigo } from './orderItemCodes';

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

describe('mensagemCodigosDuplicados', () => {
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
