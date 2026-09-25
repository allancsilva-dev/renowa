import { applySearch, buildSearchClause, MAX_SEARCH_LENGTH } from './search-filter';

describe('buildSearchClause', () => {
  const fields = { text: ['CAST(o.numero_pedido AS TEXT)', 'cliente.razao_social'], cnpj: ['cliente.cnpj'] };

  it('termo vazio ou só espaços não filtra', () => {
    expect(buildSearchClause(undefined, fields)).toBeNull();
    expect(buildSearchClause('   ', fields)).toBeNull();
  });

  it('compara texto e CNPJ com ILIKE', () => {
    const clause = buildSearchClause(' Acme ', fields);
    expect(clause).toEqual({
      where: '(CAST(o.numero_pedido AS TEXT) ILIKE :search OR cliente.razao_social ILIKE :search OR cliente.cnpj ILIKE :search)',
      params: { search: '%Acme%' },
    });
  });

  it('escapa curingas do LIKE', () => {
    expect(buildSearchClause('10%_a\\', fields)?.params.search).toBe('%10\\%\\_a\\\\%');
  });

  it('CNPJ só com dígitos ou com máscara também casa pelo CNPJ sem máscara', () => {
    const digits = buildSearchClause('12345678000190', fields);
    expect(digits?.where).toContain("regexp_replace(cliente.cnpj, '\\D', '', 'g') LIKE :searchDigits");
    expect(digits?.params.searchDigits).toBe('%12345678000190%');

    const masked = buildSearchClause('12.345.678/0001-90', fields);
    expect(masked?.params.searchDigits).toBe('%12345678000190%');
  });

  it('número curto de pedido não compara contra CNPJ sem máscara', () => {
    const clause = buildSearchClause('12', fields);
    expect(clause?.where).not.toContain('regexp_replace');
    expect(clause?.params.searchDigits).toBeUndefined();
  });

  it('termo com letras não usa a comparação por dígitos', () => {
    expect(buildSearchClause('PED 123456', fields)?.params.searchDigits).toBeUndefined();
  });

  it('sem colunas de CNPJ não gera comparação por dígitos', () => {
    expect(buildSearchClause('123456', { text: ['n.numero_nota'] })?.params.searchDigits).toBeUndefined();
  });

  it('limita o tamanho do termo', () => {
    const clause = buildSearchClause('a'.repeat(MAX_SEARCH_LENGTH + 50), fields);
    expect(clause?.params.search).toBe(`%${'a'.repeat(MAX_SEARCH_LENGTH)}%`);
  });
});

describe('applySearch', () => {
  it('só chama andWhere quando há termo', () => {
    const qb = { andWhere: jest.fn() };
    applySearch(qb, '', { text: ['x'] });
    expect(qb.andWhere).not.toHaveBeenCalled();
    applySearch(qb, 'abc', { text: ['x'] });
    expect(qb.andWhere).toHaveBeenCalledWith('(x ILIKE :search)', { search: '%abc%' });
  });
});
