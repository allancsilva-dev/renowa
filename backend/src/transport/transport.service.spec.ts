import { BadRequestException } from '@nestjs/common';
import { TransportService } from './transport.service';

const CNPJ_A = '11.222.333/0001-81';

function buildCsvFile(rows: string[], originalname = 'transportadoras.csv'): Express.Multer.File {
  return { originalname, buffer: Buffer.from(rows.join('\n'), 'utf-8') } as Express.Multer.File;
}

function makeManager(existing: Array<{ cnpj: string }> = []) {
  const saved: any[] = [];
  const repo = {
    findOne: jest.fn(async ({ where }: any) => {
      const found = existing.find((e) => e.cnpj === where.cnpj);
      return found ? { ...found, id: 1 } : null;
    }),
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
  return new TransportService({} as any, dataSource);
}

describe('TransportService#importFromFile', () => {
  it('rejeita tipo de arquivo inválido', async () => {
    const { manager } = makeManager();
    const file = buildCsvFile(['razao_social'], 'transportadoras.pdf');
    await expect(buildService(manager).importFromFile(file, 'tenant-a')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('cria transportadoras e acumula erro de razão social vazia', async () => {
    const { manager, saved } = makeManager();
    const file = buildCsvFile([
      'razao_social,cnpj,telefone,endereco_completo',
      `Transporte Um,${CNPJ_A},(11) 99999-0000,Rua A 100`,
      ',,(11) 0000-0000,Rua B',
    ]);
    const result = await buildService(manager).importFromFile(file, 'tenant-a');
    expect(result.criados).toBe(1);
    expect(result.rejeitados).toBe(1);
    expect(result.erros[0].erro).toBe('Razão social é obrigatória.');
    expect(saved[0]).toMatchObject({
      razao_social: 'Transporte Um',
      telefone: '(11) 99999-0000',
      endereco_completo: 'Rua A 100',
    });
  });

  it('atualiza por CNPJ existente', async () => {
    const { manager, saved } = makeManager([{ cnpj: CNPJ_A }]);
    const file = buildCsvFile(['razao_social,cnpj', `Nome Novo,${CNPJ_A}`]);
    const result = await buildService(manager).importFromFile(file, 'tenant-a');
    expect(result.atualizados).toBe(1);
    expect(result.criados).toBe(0);
    expect(saved[0].razao_social).toBe('Nome Novo');
  });

  it('aceita endereco como alias de endereco_completo', async () => {
    const { manager, saved } = makeManager();
    const file = buildCsvFile(['razao_social,endereco', 'Transporte,Av Central 500']);
    await buildService(manager).importFromFile(file, 'tenant-a');
    expect(saved[0].endereco_completo).toBe('Av Central 500');
  });
});
