import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ProductsService } from './products.service';

function buildCsvFile(rows: string[]): Express.Multer.File {
  return {
    originalname: 'produtos.csv',
    buffer: Buffer.from(rows.join('\n'), 'utf-8'),
  } as Express.Multer.File;
}

/** Arquivo bruto: permite simular BOM e Windows-1252 do Excel pt-BR. */
function buildRawCsvFile(buffer: Buffer): Express.Multer.File {
  return { originalname: 'produtos.csv', buffer } as Express.Multer.File;
}

function makeManager(existingProducts: Array<{ codigo: string; fornecedor_id: number; [key: string]: unknown }> = []) {
  const saved: any[] = [];
  const productRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      const found = existingProducts.find(
        (p) => p.codigo === where.codigo && p.fornecedor_id === where.fornecedor_id,
      );
      return found ? { ...found, id: 1 } : null;
    }),
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => {
      saved.push(value);
      return value;
    }),
  };
  const manager = {
    query: jest.fn().mockResolvedValue([{ id: 42 }]),
    getRepository: jest.fn(() => productRepo),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save: jest.fn(async (value: unknown) => value),
  };
  return { manager, productRepo, saved };
}

function buildService(manager: any) {
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)), query: jest.fn() } as any;
  return new ProductsService({} as any, dataSource, {} as any);
}

describe('ProductsService#importFromFile', () => {
  it('rejeita quando não há arquivo', async () => {
    const { manager } = makeManager();
    const service = buildService(manager);
    await expect(service.importFromFile(undefined, 'fornecedor-uuid', 'tenant-a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita quando fornecedor_uuid não é informado', async () => {
    const { manager } = makeManager();
    const service = buildService(manager);
    const file = buildCsvFile(['codigo,descricao,preco_base']);
    await expect(service.importFromFile(file, undefined, 'tenant-a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita tipo de arquivo inválido', async () => {
    const { manager } = makeManager();
    const service = buildService(manager);
    const file = { originalname: 'produtos.pdf', buffer: Buffer.from('x') } as Express.Multer.File;
    await expect(service.importFromFile(file, 'fornecedor-uuid', 'tenant-a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita conteúdo inválido em arquivo .xlsx', async () => {
    const { manager } = makeManager();
    const service = buildService(manager);
    const file = { originalname: 'produtos.xlsx', buffer: Buffer.from('x') } as Express.Multer.File;
    await expect(service.importFromFile(file, 'fornecedor-uuid', 'tenant-a')).rejects.toThrow(
      /Arquivo XLSX inválido/,
    );
  });

  it('rejeita arquivo com mais de 5000 linhas', async () => {
    const { manager } = makeManager();
    const service = buildService(manager);
    const header = 'codigo,descricao,preco_base';
    const rows = Array.from({ length: 5001 }, (_, i) => `C${i},Produto ${i},10.00`);
    const file = buildCsvFile([header, ...rows]);
    await expect(service.importFromFile(file, 'fornecedor-uuid', 'tenant-a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aceita exatamente 5000 linhas (limite do parse não corta arquivo válido)', async () => {
    const { manager, saved } = makeManager();
    const service = buildService(manager);
    const header = 'codigo,descricao,preco_base';
    const rows = Array.from({ length: 5000 }, (_, i) => `C${i},Produto ${i},10.00`);

    const result = await service.importFromFile(buildCsvFile([header, ...rows]), 'fornecedor-uuid', 'tenant-a');

    expect(result.criados).toBe(5000);
    expect(result.rejeitados).toBe(0);
    expect(saved).toHaveLength(5000);
  });

  it('lança 404 quando fornecedor não existe no tenant', async () => {
    const { manager } = makeManager();
    manager.query.mockResolvedValueOnce([]);
    const service = buildService(manager);
    const file = buildCsvFile(['codigo,descricao,preco_base', 'C1,Produto 1,10.00']);
    await expect(service.importFromFile(file, 'fornecedor-uuid', 'tenant-a')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('importa criando produtos novos e nunca lança por erro de linha individual', async () => {
    const { manager, saved } = makeManager();
    const service = buildService(manager);
    const file = buildCsvFile([
      'codigo,descricao,preco_base',
      'C1,Produto 1,10.50',
      ',Sem código,5.00',
      'C1,Duplicado no arquivo,1.00',
      'C2,,5.00',
      'C3,Preço inválido,abc',
      'C4,Sem preço,',
    ]);

    const result = await service.importFromFile(file, 'fornecedor-uuid', 'tenant-a');

    expect(result.criados).toBe(2); // C1 e C4
    expect(result.atualizados).toBe(0);
    expect(result.rejeitados).toBe(4); // vazio, duplicado, sem descrição, preço inválido
    expect(result.erros).toHaveLength(4);
    expect(result.erros.map((e) => e.erro)).toEqual(
      expect.arrayContaining([
        'Código é obrigatório.',
        'Código duplicado no arquivo.',
        'Descrição é obrigatória.',
        'Preço base inválido.',
      ]),
    );
    expect(saved.some((p) => p.codigo === 'C1' && p.preco_base === '10.50')).toBe(true);
    expect(saved.some((p) => p.codigo === 'C4' && p.preco_base === null)).toBe(true);
  });

  it('atualiza produto existente do mesmo fornecedor em vez de duplicar', async () => {
    const { manager, saved } = makeManager([{ codigo: 'C1', fornecedor_id: 42 }]);
    const service = buildService(manager);
    const file = buildCsvFile(['codigo,descricao,preco_base', 'C1,Produto atualizado,20.00']);

    const result = await service.importFromFile(file, 'fornecedor-uuid', 'tenant-a');

    expect(result.criados).toBe(0);
    expect(result.atualizados).toBe(1);
    expect(result.rejeitados).toBe(0);
    expect(saved[0].descricao).toBe('Produto atualizado');
    expect(saved[0].preco_base).toBe('20.00');
  });

  it.each([
    ['0', '0.00'],
    ['100', '100.00'],
    ['12,5', '12.50'],
    ['12.50', '12.50'],
  ])('importa IPI válido "%s" como %s', async (raw, expected) => {
    const { manager, saved } = makeManager();
    const service = buildService(manager);
    const result = await service.importFromFile(buildCsvFile([
      'codigo;descricao;preco_base;ipi_perc;foto',
      `C1;Produto 1;10,50;${raw};`,
    ]), 'fornecedor-uuid', 'tenant-a');

    expect(result.rejeitados).toBe(0);
    expect(saved[0].ipi_perc).toBe(expected);
  });

  it.each(['-0,01', '100,01', 'abc'])('rejeita apenas a linha com IPI inválido "%s"', async (raw) => {
    const { manager, saved } = makeManager();
    const service = buildService(manager);
    const result = await service.importFromFile(buildCsvFile([
      'codigo;descricao;preco_base;ipi_perc',
      `C1;Inválido;99;${raw}`,
      'C2;Válido;20;5',
    ]), 'fornecedor-uuid', 'tenant-a');

    expect(result).toMatchObject({ criados: 1, rejeitados: 1 });
    expect(result.erros[0]).toMatchObject({ linha: 2, codigo: 'C1', erro: 'IPI inválido.' });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ codigo: 'C2', ipi_perc: '5.00' });
  });

  it('grava IPI nulo no novo e preserva o atual no produto existente quando vazio', async () => {
    const { manager, saved } = makeManager([{ codigo: 'C1', fornecedor_id: 42, ipi_perc: '8.00' }]);
    const service = buildService(manager);
    const result = await service.importFromFile(buildCsvFile([
      'codigo;descricao;preco_base;ipi_perc',
      'C1;Existente atualizado;20;',
      'C2;Novo;30;',
    ]), 'fornecedor-uuid', 'tenant-a');

    expect(result).toMatchObject({ criados: 1, atualizados: 1, rejeitados: 0 });
    expect(saved.find((product) => product.codigo === 'C1').ipi_perc).toBe('8.00');
    expect(saved.find((product) => product.codigo === 'C2').ipi_perc).toBeNull();
  });

  it('localiza as colunas XLSX pelo cabeçalho e aceita foto na coluna D do modelo antigo', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Produtos');
    sheet.addRow(['descricao', 'preco_base', 'codigo', 'foto']);
    sheet.addRow(['Produto legado', 10.5, 'LEG-1', '']);
    const imageId = workbook.addImage({
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      extension: 'png',
    });
    sheet.addImage(imageId, { tl: { col: 3, row: 1 }, ext: { width: 24, height: 24 } });
    const buffer = await workbook.xlsx.writeBuffer();
    const file = { originalname: 'produtos.xlsx', buffer: Buffer.from(buffer), size: buffer.byteLength } as Express.Multer.File;
    const { manager, saved } = makeManager();

    const result = await buildService(manager).importFromFile(file, 'fornecedor-uuid', 'tenant-a');

    expect(result.rejeitados).toBe(0);
    expect(saved[0]).toMatchObject({ codigo: 'LEG-1', descricao: 'Produto legado', preco_base: '10.50', ipi_perc: null });
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ produto_id: saved[0].id }));
  });

  it('gera modelo XLSX novo com IPI antes de foto', async () => {
    const { manager } = makeManager();
    const buffer = await buildService(manager).xlsxTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    expect(workbook.worksheets[0].getRow(1).values).toEqual([
      undefined, 'codigo', 'descricao', 'preco_base', 'ipi_perc', 'quantidade', 'foto',
    ]);
  });

  it('importa quantidade inteira e não negativa', async () => {
    const { manager, saved } = makeManager();
    const result = await buildService(manager).importFromFile(buildCsvFile([
      'codigo;descricao;quantidade',
      'C1;Produto 1;12',
    ]), 'fornecedor-uuid', 'tenant-a');

    expect(result).toMatchObject({ criados: 1, rejeitados: 0 });
    expect(saved[0].quantidade).toBe(12);
  });

  it.each(['-1', '1.5', 'texto'])('rejeita quantidade inválida "%s"', async (quantidade) => {
    const { manager } = makeManager();
    const result = await buildService(manager).importFromFile(buildCsvFile([
      'codigo;descricao;quantidade',
      `C1;Produto 1;${quantidade}`,
    ]), 'fornecedor-uuid', 'tenant-a');

    expect(result).toMatchObject({ criados: 0, rejeitados: 1 });
    expect(result.erros[0].erro).toBe('Quantidade inválida.');
  });

  it('usa 1 em produto novo e mantém valor existente quando quantidade está vazia', async () => {
    const novo = makeManager();
    await buildService(novo.manager).importFromFile(buildCsvFile([
      'codigo;descricao;quantidade',
      'NOVO;Produto novo;',
    ]), 'fornecedor-uuid', 'tenant-a');
    expect(novo.saved[0].quantidade).toBe(1);

    const existente = makeManager([{ codigo: 'EXISTE', fornecedor_id: 42, quantidade: 8 }]);
    await buildService(existente.manager).importFromFile(buildCsvFile([
      'codigo;descricao;quantidade',
      'EXISTE;Produto atualizado;',
    ]), 'fornecedor-uuid', 'tenant-a');
    expect(existente.saved[0].quantidade).toBe(8);
  });
});

/**
 * Armadilhas reais do CSV exportado pelo Excel pt-BR. Cada caso abaixo
 * já causou (ou causaria) rejeição silenciosa de linhas válidas.
 */
describe('ProductsService#importFromFile — CSV do Excel pt-BR', () => {
  describe('separador de colunas', () => {
    it('aceita vírgula como separador', async () => {
      const { manager, saved } = makeManager();
      const service = buildService(manager);
      const file = buildCsvFile(['codigo,descricao,preco_base', 'C1,Produto 1,10.50']);

      const result = await service.importFromFile(file, 'fornecedor-uuid', 'tenant-a');

      expect(result.criados).toBe(1);
      expect(result.rejeitados).toBe(0);
      expect(saved[0]).toMatchObject({ codigo: 'C1', descricao: 'Produto 1', preco_base: '10.50' });
    });

    it('aceita ponto-e-vírgula (padrão do Excel pt-BR) como separador', async () => {
      const { manager, saved } = makeManager();
      const service = buildService(manager);
      const file = buildCsvFile(['codigo;descricao;preco_base', 'C1;Produto 1;10,50']);

      const result = await service.importFromFile(file, 'fornecedor-uuid', 'tenant-a');

      expect(result.criados).toBe(1);
      expect(result.rejeitados).toBe(0);
      expect(saved[0]).toMatchObject({ codigo: 'C1', descricao: 'Produto 1', preco_base: '10.50' });
    });
  });

  describe('encoding', () => {
    it('lê UTF-8 puro preservando acentos', async () => {
      const { manager, saved } = makeManager();
      const service = buildService(manager);
      const file = buildRawCsvFile(
        Buffer.from('codigo,descricao,preco_base\nC1,Cadeira de Rodão,10.00', 'utf-8'),
      );

      const result = await service.importFromFile(file, 'fornecedor-uuid', 'tenant-a');

      expect(result.criados).toBe(1);
      expect(saved[0].descricao).toBe('Cadeira de Rodão');
    });

    it('remove BOM do "CSV UTF-8" do Excel (senão a 1ª coluna não é reconhecida)', async () => {
      const { manager, saved } = makeManager();
      const service = buildService(manager);
      const file = buildRawCsvFile(
        Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from('codigo,descricao,preco_base\nC1,Descrição,10.00', 'utf-8'),
        ]),
      );

      const result = await service.importFromFile(file, 'fornecedor-uuid', 'tenant-a');

      expect(result.criados).toBe(1);
      expect(result.rejeitados).toBe(0);
      expect(saved[0]).toMatchObject({ codigo: 'C1', descricao: 'Descrição' });
    });

    it('faz fallback para Windows-1252 quando o arquivo não é UTF-8 válido', async () => {
      const { manager, saved } = makeManager();
      const service = buildService(manager);
      // "Descrição" em Windows-1252: ç = 0xE7, ã = 0xE3 (inválidos em UTF-8).
      const latin1Body = Buffer.from('codigo,descricao,preco_base\nC1,Descrição,10.00', 'latin1');
      expect(latin1Body.includes(0xe7)).toBe(true);

      const result = await service.importFromFile(
        buildRawCsvFile(latin1Body),
        'fornecedor-uuid',
        'tenant-a',
      );

      expect(result.criados).toBe(1);
      expect(result.rejeitados).toBe(0);
      expect(saved[0].descricao).toBe('Descrição');
    });
  });

  describe('separador decimal', () => {
    // Delimitador ';' — é assim que o Excel pt-BR evita conflito entre o
    // separador de colunas e a vírgula decimal.
    async function importPrice(raw: string) {
      const { manager, saved } = makeManager();
      const service = buildService(manager);
      const file = buildCsvFile(['codigo;descricao;preco_base', `C1;Produto 1;${raw}`]);
      const result = await service.importFromFile(file, 'fornecedor-uuid', 'tenant-a');
      return { result, saved };
    }

    it.each([
      ['1234.56', '1234.56'], // formato que já funcionava — não pode regredir
      ['1234,56', '1234.56'],
      ['1.234,56', '1234.56'], // Excel pt-BR: falhava com NaN antes da correção
      ['1.234.567,89', '1234567.89'],
      ['1,234.56', '1234.56'], // en-US com separador de milhar
      ['10', '10.00'],
      ['0,5', '0.50'],
      ['R$ 1.234,56', '1234.56'],
    ])('aceita "%s" e grava %s', async (raw, expected) => {
      const { result, saved } = await importPrice(raw);
      expect(result.rejeitados).toBe(0);
      expect(saved[0].preco_base).toBe(expected);
    });

    it.each(['abc', '12,,50', '1.2.3,4,5', '-'])('rejeita preço inválido "%s"', async (raw) => {
      const { result, saved } = await importPrice(raw);
      expect(result.criados).toBe(0);
      expect(result.rejeitados).toBe(1);
      expect(result.erros[0].erro).toBe('Preço base inválido.');
      expect(saved).toHaveLength(0);
    });
  });
});

/**
 * Harness de `create`/`update`. As duas rodam em transação e conversam com o
 * banco por três caminhos distintos, que o mock precisa distinguir: busca de
 * fornecedor (SQL), busca de código já usado (SQL) e o repositório da entidade.
 */
function buildServiceWithRepo(options: {
  existing?: Record<string, unknown> | null;
  /** Linha devolvida pela checagem de código duplicado. */
  codigoEmUso?: { descricao: string } | null;
  /** Falha injetada no `save`, para exercitar rollback. */
  falhaAoSalvar?: Error;
} = {}) {
  const saved: any[] = [];
  const productRepo = {
    target: 'Product',
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => {
      if (options.falhaAoSalvar) throw options.falhaAoSalvar;
      saved.push(value);
      return value;
    }),
    findOne: jest.fn(async () => options.existing ?? null),
    softDelete: jest.fn(async () => ({ affected: 1 })),
  };

  const query = jest.fn(async (sql: string) => {
    if (sql.includes('fornecedores')) return [{ id: 7 }];
    if (sql.includes('FROM produtos')) return options.codigoEmUso ? [options.codigoEmUso] : [];
    return [];
  });

  const manager = { query, getRepository: jest.fn(() => productRepo) };
  const dataSource = {
    query,
    transaction: jest.fn(async (cb: any) => cb(manager)),
  } as any;

  const photosService = { removeByProductId: jest.fn(async () => undefined) };
  const service = new ProductsService(productRepo as any, dataSource, photosService as any);
  return { service, saved, productRepo, photosService, manager, dataSource };
}

describe('ProductsService#create/#update — ipi_perc', () => {

  it('normaliza ipi_perc para 2 casas decimais ao criar', async () => {
    const { service, saved } = buildServiceWithRepo();
    await service.create(
      { uuid: 'p1', fornecedor_uuid: 'f1', descricao: 'Produto', ipi_perc: 12 } as any,
      'tenant1',
    );
    expect(saved[0].ipi_perc).toBe('12.00');
  });

  it('mantém ipi_perc nulo quando não informado na criação', async () => {
    const { service, saved } = buildServiceWithRepo();
    await service.create(
      { uuid: 'p1', fornecedor_uuid: 'f1', descricao: 'Produto' } as any,
      'tenant1',
    );
    expect(saved[0].ipi_perc).toBeNull();
  });

  it('atualiza ipi_perc de um produto existente', async () => {
    const { service, saved } = buildServiceWithRepo({
      existing: { id: 7, uuid: 'p1', tenant_id: 'tenant1', ipi_perc: '5.00' },
    });
    await service.update('p1', { ipi_perc: 18.5 } as any, 'tenant1');
    expect(saved[0].ipi_perc).toBe('18.50');
  });
});

describe('ProductsService#create/#update — quantidade', () => {
  it('usa quantidade 1 quando omitida na criação', async () => {
    const { service, saved } = buildServiceWithRepo();
    await service.create(
      { uuid: 'p1', fornecedor_uuid: 'f1', descricao: 'Produto' } as any,
      'tenant1',
    );
    expect(saved[0].quantidade).toBe(1);
  });

  it('grava quantidade informada na criação', async () => {
    const { service, saved } = buildServiceWithRepo();
    await service.create(
      { uuid: 'p1', fornecedor_uuid: 'f1', descricao: 'Produto', quantidade: 7 } as any,
      'tenant1',
    );
    expect(saved[0].quantidade).toBe(7);
  });

  it('atualiza quantidade de produto existente', async () => {
    const { service, saved } = buildServiceWithRepo({
      existing: { id: 7, uuid: 'p1', tenant_id: 'tenant1', quantidade: 3 },
    });
    await service.update('p1', { quantidade: 9 } as any, 'tenant1');
    expect(saved[0].quantidade).toBe(9);
  });
});

/**
 * O uuid vem do cliente e é a chave de idempotência do sistema. Reenviar a mesma
 * criação — duplo clique, retry de rede, fila offline do celular que perdeu a
 * resposta — não pode produzir um segundo produto.
 */
describe('ProductsService#create — idempotência por uuid', () => {
  it('uuid já cadastrado devolve o existente, sem gravar', async () => {
    const existente = { id: 9, uuid: 'p1', tenant_id: 'tenant1', descricao: 'Produto' };
    const { service, saved, productRepo } = buildServiceWithRepo({ existing: existente });

    await expect(service.create(
      { uuid: 'p1', fornecedor_uuid: 'f1', descricao: 'Produto' } as any, 'tenant1',
    )).resolves.toBe(existente);

    expect(productRepo.save).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });

  /**
   * Duas requisições com o mesmo uuid ao mesmo tempo passam as duas pela busca;
   * a segunda toma 23505 no índice `(tenant_id, uuid)`. A releitura resolve: o
   * registro é o da concorrente, e o cliente recebe o mesmo produto.
   */
  it('corrida no mesmo uuid: 23505 vira releitura, não erro', async () => {
    const concorrente = { id: 9, uuid: 'p1', tenant_id: 'tenant1' };
    const { service, productRepo } = buildServiceWithRepo();
    productRepo.findOne
      .mockResolvedValueOnce(null)      // busca inicial: ainda não existe
      .mockResolvedValueOnce(concorrente); // releitura após o 23505
    productRepo.save.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));

    await expect(service.create(
      { uuid: 'p1', fornecedor_uuid: 'f1', descricao: 'Produto' } as any, 'tenant1',
    )).resolves.toBe(concorrente);
  });

  /**
   * 23505 de OUTRO índice (código duplicado) não é replay: não há registro com
   * aquele uuid para devolver, e engolir o erro criaria a ilusão de sucesso.
   */
  it('23505 que não é do uuid sobe intacto', async () => {
    const { service, productRepo } = buildServiceWithRepo();
    const violacao = Object.assign(new Error('uq_produtos_codigo'), { code: '23505' });
    productRepo.save.mockRejectedValueOnce(violacao);

    await expect(service.create(
      { uuid: 'p1', fornecedor_uuid: 'f1', descricao: 'Produto', codigo: 'A1' } as any, 'tenant1',
    )).rejects.toBe(violacao);
  });
});

describe('ProductsService — código único por fornecedor', () => {
  it('recusa criar com código já usado no mesmo fornecedor', async () => {
    const { service, saved } = buildServiceWithRepo({ codigoEmUso: { descricao: 'Produto A' } });

    await expect(service.create(
      { uuid: 'p2', fornecedor_uuid: 'f1', descricao: 'Produto B', codigo: 'A1' } as any, 'tenant1',
    )).rejects.toBeInstanceOf(ConflictException);
    expect(saved).toHaveLength(0);
  });

  it('produto sem código não passa pela checagem', async () => {
    const { service, manager, saved } = buildServiceWithRepo();

    await service.create(
      { uuid: 'p3', fornecedor_uuid: 'f1', descricao: 'Sem código' } as any, 'tenant1',
    );

    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('FROM produtos'), expect.anything(),
    );
    expect(saved).toHaveLength(1);
  });

  it('recusa renomear para um código já usado, ignorando o próprio produto', async () => {
    const { service } = buildServiceWithRepo({
      existing: { id: 7, uuid: 'p1', tenant_id: 'tenant1', fornecedor_id: 7 },
      codigoEmUso: { descricao: 'Produto A' },
    });

    await expect(service.update('p1', { codigo: 'A1' } as any, 'tenant1'))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('a checagem do update exclui o próprio id — salvar sem trocar o código passa', async () => {
    const { service, manager, saved } = buildServiceWithRepo({
      existing: { id: 7, uuid: 'p1', tenant_id: 'tenant1', fornecedor_id: 7, codigo: 'A1' },
    });

    await service.update('p1', { descricao: 'Novo nome' } as any, 'tenant1');

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('id <> $4'),
      ['tenant1', 7, 'A1', 7],
    );
    expect(saved).toHaveLength(1);
  });
});

/**
 * A purga da foto zera bytes de forma IRREVERSÍVEL. Antes ela commitava numa
 * transação própria e só então vinha o soft delete do produto: um erro no meio
 * deixava a imagem destruída com o produto vivo, sem como recuperar.
 */
describe('ProductsService#remove', () => {
  it('purga a foto e exclui o produto na MESMA transação', async () => {
    const { service, productRepo, photosService, manager, dataSource } = buildServiceWithRepo({
      existing: { id: 7, uuid: 'p1', tenant_id: 'tenant1' },
    });

    await service.remove('p1', 'tenant1');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    // O manager da transação chega na purga: é isso que a torna atômica.
    expect(photosService.removeByProductId).toHaveBeenCalledWith(7, 'tenant1', manager);
    expect(productRepo.softDelete).toHaveBeenCalledWith(7);
  });

  it('falha no soft delete propaga de dentro da transação, que desfaz a purga', async () => {
    const { service, productRepo, dataSource } = buildServiceWithRepo({
      existing: { id: 7, uuid: 'p1', tenant_id: 'tenant1' },
    });
    const falha = new Error('deadlock');
    productRepo.softDelete.mockRejectedValueOnce(falha);

    await expect(service.remove('p1', 'tenant1')).rejects.toBe(falha);

    // O erro escapa do callback da transação — é o que dispara o ROLLBACK e
    // devolve os bytes. Antes, a purga já tinha commitado sozinha.
    await expect(dataSource.transaction.mock.results[0].value).rejects.toBe(falha);
  });

  it('produto de outro tenant: 404 antes de tocar na foto', async () => {
    const { service, photosService } = buildServiceWithRepo({ existing: null });

    await expect(service.remove('p1', 'tenant1')).rejects.toBeInstanceOf(NotFoundException);
    expect(photosService.removeByProductId).not.toHaveBeenCalled();
  });
});
