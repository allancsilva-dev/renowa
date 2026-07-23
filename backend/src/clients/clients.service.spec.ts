import { ClientsService } from './clients.service';

const CNPJ_A = '11.222.333/0001-81';
const TRANSP_CNPJ = '99.888.777/0001-00';

function buildCsvFile(rows: string[], originalname = 'clientes.csv'): Express.Multer.File {
  return { originalname, buffer: Buffer.from(rows.join('\n'), 'utf-8') } as Express.Multer.File;
}

/**
 * `transportadoras` simula a tabela: resolve por dígitos de CNPJ ou por
 * razão social (case-insensitive), sempre dentro do tenant.
 */
function makeManager(
  existingClients: Array<{ cnpj: string }> = [],
  transportadoras: Array<{ id: number; cnpjDigits?: string; razao?: string }> = [],
) {
  const saved: any[] = [];
  const repo = {
    findOne: jest.fn(async ({ where }: any) => {
      const found = existingClients.find((e) => e.cnpj === where.cnpj);
      return found ? { ...found, id: 1 } : null;
    }),
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => {
      saved.push(value);
      return value;
    }),
  };
  const manager = {
    getRepository: jest.fn(() => repo),
    query: jest.fn(async (sql: string, params: any[]) => {
      if (sql.includes('regexp_replace')) {
        const t = transportadoras.find((x) => x.cnpjDigits === params[0]);
        return t ? [{ id: t.id }] : [];
      }
      // busca por razão social
      const t = transportadoras.find((x) => x.razao?.toLowerCase() === String(params[0]).toLowerCase());
      return t ? [{ id: t.id }] : [];
    }),
  };
  return { manager, saved };
}

function buildService(manager: any) {
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
  return new ClientsService({} as any, dataSource, {} as any);
}

describe('ClientsService#importFromFile', () => {
  it('cria clientes e acumula erros por linha', async () => {
    const { manager, saved } = makeManager();
    const file = buildCsvFile([
      'razao_social,cnpj,email,uf',
      `Cliente Um,${CNPJ_A},a@b.com,SP`,
      ',,sem@nome.com,SP',
      'UF ruim,,x@y.com,PARANA',
    ]);
    const result = await buildService(manager).importFromFile(file, 'tenant-a');
    expect(result.criados).toBe(1);
    expect(result.rejeitados).toBe(2);
    expect(result.erros.map((e) => e.erro)).toEqual(
      expect.arrayContaining(['Razão social é obrigatória.', 'UF deve ter 2 letras.']),
    );
    expect(saved[0]).toMatchObject({ razao_social: 'Cliente Um', email: 'a@b.com', tenant_id: 'tenant-a' });
  });

  it('resolve transportadora por CNPJ', async () => {
    const { manager, saved } = makeManager([], [{ id: 7, cnpjDigits: '99888777000100' }]);
    const file = buildCsvFile([
      'razao_social,cnpj,transportadora_cnpj',
      `Cliente,${CNPJ_A},${TRANSP_CNPJ}`,
    ]);
    await buildService(manager).importFromFile(file, 'tenant-a');
    expect(saved[0].transportadora_id).toBe(7);
  });

  it('resolve transportadora por razão social quando não há CNPJ', async () => {
    const { manager, saved } = makeManager([], [{ id: 9, razao: 'Trans Rápida' }]);
    const file = buildCsvFile(['razao_social,transportadora', 'Cliente,Trans Rápida']);
    await buildService(manager).importFromFile(file, 'tenant-a');
    expect(saved[0].transportadora_id).toBe(9);
  });

  it('não rejeita a linha quando a transportadora não é encontrada (fica nula)', async () => {
    const { manager, saved } = makeManager([], []);
    const file = buildCsvFile([
      'razao_social,transportadora_cnpj',
      'Cliente,00.000.000/0000-00',
    ]);
    const result = await buildService(manager).importFromFile(file, 'tenant-a');
    expect(result.criados).toBe(1);
    expect(result.rejeitados).toBe(0);
    expect(saved[0].transportadora_id).toBeUndefined();
  });

  it('atualiza cliente existente por CNPJ', async () => {
    const { manager, saved } = makeManager([{ cnpj: CNPJ_A }]);
    const file = buildCsvFile(['razao_social,cnpj', `Nome Atualizado,${CNPJ_A}`]);
    const result = await buildService(manager).importFromFile(file, 'tenant-a');
    expect(result.atualizados).toBe(1);
    expect(saved[0].razao_social).toBe('Nome Atualizado');
  });
});
