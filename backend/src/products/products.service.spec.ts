import { BadRequestException, NotFoundException } from '@nestjs/common';
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

function makeManager(existingProducts: Array<{ codigo: string; fornecedor_id: number }> = []) {
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
  };
  return { manager, productRepo, saved };
}

function buildService(manager: any) {
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)), query: jest.fn() } as any;
  return new ProductsService({} as any, dataSource);
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

  it('rejeita .xlsx (import aceita apenas .csv)', async () => {
    const { manager } = makeManager();
    const service = buildService(manager);
    const file = { originalname: 'produtos.xlsx', buffer: Buffer.from('x') } as Express.Multer.File;
    await expect(service.importFromFile(file, 'fornecedor-uuid', 'tenant-a')).rejects.toThrow(
      /Tipo de arquivo inválido/,
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

describe('ProductsService#create/#update — ipi_perc', () => {
  function buildServiceWithRepo(existing: Record<string, unknown> | null = null) {
    const saved: any[] = [];
    const productRepo = {
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => {
        saved.push(value);
        return value;
      }),
      findOne: jest.fn(async () => existing),
    };
    const dataSource = { query: jest.fn().mockResolvedValue([{ id: 7 }]) } as any;
    const service = new ProductsService(productRepo as any, dataSource);
    return { service, saved };
  }

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
      id: 7, uuid: 'p1', tenant_id: 'tenant1', ipi_perc: '5.00',
    });
    await service.update('p1', { ipi_perc: 18.5 } as any, 'tenant1');
    expect(saved[0].ipi_perc).toBe('18.50');
  });
});
