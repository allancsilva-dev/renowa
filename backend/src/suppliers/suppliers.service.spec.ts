import { BadRequestException, ConflictException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';

const CNPJ_A = '11.222.333/0001-81';
const CNPJ_B = '99.888.777/0001-00';

function buildCsvFile(rows: string[], originalname = 'fornecedores.csv'): Express.Multer.File {
  return { originalname, buffer: Buffer.from(rows.join('\n'), 'utf-8') } as Express.Multer.File;
}

function makeManager(existing: Array<{ cnpj: string }> = []) {
  const saved: any[] = [];
  const query = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => existing[0] ? { ...existing[0], id: 1 } : null),
  };
  const repo = {
    findOne: jest.fn(async ({ where }: any) => {
      const found = existing.find((e) => e.cnpj === where.cnpj);
      return found ? { ...found, id: 1 } : null;
    }),
    createQueryBuilder: jest.fn(() => query),
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => {
      saved.push(value);
      return value;
    }),
  };
  const manager = { getRepository: jest.fn(() => repo) };
  return { manager, saved };
}

function buildService(manager: any) {
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
  return new SuppliersService({} as any, dataSource);
}

describe('SuppliersService#importFromFile', () => {
  it('rejeita quando não há arquivo', async () => {
    const { manager } = makeManager();
    await expect(buildService(manager).importFromFile(undefined, 'tenant-a')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejeita tipo de arquivo inválido', async () => {
    const { manager } = makeManager();
    const file = buildCsvFile(['razao_social'], 'fornecedores.xlsx');
    await expect(buildService(manager).importFromFile(file, 'tenant-a')).rejects.toThrow(
      /Tipo de arquivo inválido/,
    );
  });

  it('rejeita arquivo com mais de 5000 linhas', async () => {
    const { manager } = makeManager();
    const rows = Array.from({ length: 5001 }, (_, i) => `Fornecedor ${i}`);
    const file = buildCsvFile(['razao_social', ...rows]);
    await expect(buildService(manager).importFromFile(file, 'tenant-a')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('cria fornecedores e nunca lança por erro de linha individual', async () => {
    const { manager, saved } = makeManager();
    const file = buildCsvFile([
      'razao_social,cnpj,cidade,uf',
      `Fornecedor Um,${CNPJ_A},São Paulo,SP`,
      `,${CNPJ_B},Sem razão,SP`,
      'Sem CNPJ,,Rio,RJ',
      'UF inválida,,Curitiba,PARANA',
      `Duplicado no arquivo,${CNPJ_A},Campinas,SP`,
    ]);

    const result = await buildService(manager).importFromFile(file, 'tenant-a');

    expect(result.criados).toBe(2); // Fornecedor Um + Sem CNPJ
    expect(result.rejeitados).toBe(3); // sem razão, UF inválida, CNPJ duplicado
    expect(result.erros.map((e) => e.erro)).toEqual(
      expect.arrayContaining([
        'Razão social é obrigatória.',
        'UF deve ter 2 letras.',
        'CNPJ duplicado no arquivo.',
      ]),
    );
    expect(saved.every((s) => s.tenant_id === 'tenant-a' && s.uuid)).toBe(true);
  });

  it('rejeita CNPJ com formato inválido sem interromper', async () => {
    const { manager, saved } = makeManager();
    const file = buildCsvFile(['razao_social,cnpj', 'Fornecedor,12.345.678/0001-00']);
    const result = await buildService(manager).importFromFile(file, 'tenant-a');
    expect(result.criados).toBe(0);
    expect(result.rejeitados).toBe(1);
    expect(result.erros[0].erro).toBe('CNPJ inválido.');
    expect(saved).toHaveLength(0);
  });

  it('atualiza fornecedor existente com mesmo CNPJ em vez de duplicar', async () => {
    const { manager, saved } = makeManager([{ cnpj: CNPJ_A }]);
    const file = buildCsvFile(['razao_social,cnpj,cidade', `Nome Atualizado,${CNPJ_A},Santos`]);
    const result = await buildService(manager).importFromFile(file, 'tenant-a');
    expect(result.criados).toBe(0);
    expect(result.atualizados).toBe(1);
    expect(saved[0].razao_social).toBe('Nome Atualizado');
    expect(saved[0].cidade).toBe('Santos');
  });

  it('não sobrescreve campo existente quando a coluna vem vazia', async () => {
    const { manager, saved } = makeManager([{ cnpj: CNPJ_A }]);
    (manager.getRepository() as any).createQueryBuilder().getOne.mockResolvedValueOnce({
      id: 1,
      cnpj: CNPJ_A,
      cidade: 'Cidade Original',
    });
    const file = buildCsvFile(['razao_social,cnpj,cidade', `Novo Nome,${CNPJ_A},`]);
    await buildService(manager).importFromFile(file, 'tenant-a');
    expect(saved[0].cidade).toBe('Cidade Original');
    expect(saved[0].razao_social).toBe('Novo Nome');
  });

  it('aceita ponto-e-vírgula (Excel pt-BR) como separador', async () => {
    const { manager, saved } = makeManager();
    const file = buildCsvFile(['razao_social;cnpj;cidade', `Fornecedor;${CNPJ_A};São Paulo`]);
    const result = await buildService(manager).importFromFile(file, 'tenant-a');
    expect(result.criados).toBe(1);
    expect(saved[0]).toMatchObject({ razao_social: 'Fornecedor', cidade: 'São Paulo' });
  });
});

describe('SuppliersService#create CNPJ', () => {
  it('bloqueia CNPJ ativo repetido', async () => {
    const query = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn(async () => ({ id: 1 })) };
    const repo = { createQueryBuilder: jest.fn(() => query), create: jest.fn(), save: jest.fn() };
    const service = new SuppliersService(repo as any, {} as any);
    await expect(service.create({ razao_social: 'Duplicado', cnpj: CNPJ_A } as any, 'tenant-a'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
