import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ProductsService } from './products.service';

function buildCsvFile(rows: string[]): Express.Multer.File {
  return {
    originalname: 'produtos.csv',
    buffer: Buffer.from(rows.join('\n'), 'utf-8'),
  } as Express.Multer.File;
}

function buildXlsxFile(rows: Array<Record<string, unknown>>): Express.Multer.File {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Produtos');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return { originalname: 'produtos.xlsx', buffer } as Express.Multer.File;
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

  it('rejeita arquivo com mais de 5000 linhas', async () => {
    const { manager } = makeManager();
    const service = buildService(manager);
    const header = 'codigo,descricao,preco_base';
    const rows = Array.from({ length: 5001 }, (_, i) => `C${i},Produto ${i},10.00`);
    const file = buildCsvFile([header, ...rows]);
    await expect(service.importFromFile(file, 'fornecedor-uuid', 'tenant-a')).rejects.toBeInstanceOf(BadRequestException);
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
    const file = buildXlsxFile([
      { codigo: 'C1', descricao: 'Produto 1', preco_base: '10.50' },
      { codigo: '', descricao: 'Sem código', preco_base: '5.00' },
      { codigo: 'C1', descricao: 'Duplicado no arquivo', preco_base: '1.00' },
      { codigo: 'C2', descricao: '', preco_base: '5.00' },
      { codigo: 'C3', descricao: 'Preço inválido', preco_base: 'abc' },
      { codigo: 'C4', descricao: 'Sem preço' },
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
