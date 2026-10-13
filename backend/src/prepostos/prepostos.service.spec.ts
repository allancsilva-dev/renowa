import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrepostosService } from './prepostos.service';
import { CreatePrepostoDto } from './dto/create-preposto.dto';
import { UpdatePrepostoDto } from './dto/update-preposto.dto';

const tenantId = 'tenant-a';
const uuid = '77777777-7777-4777-8777-777777777777';

function qbMock(exists = false) {
  const qb: any = {};
  for (const method of ['where', 'andWhere', 'orderBy', 'skip', 'take']) qb[method] = jest.fn().mockReturnValue(qb);
  qb.getExists = jest.fn().mockResolvedValue(exists);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  qb.update = jest.fn().mockReturnValue(qb);
  qb.set = jest.fn().mockReturnValue(qb);
  qb.returning = jest.fn().mockReturnValue(qb);
  qb.execute = jest.fn().mockResolvedValue({ affected: 1, raw: [{ uuid }] });
  return qb;
}

function subject({ exists = false, pedidosEmAndamento = 0 } = {}) {
  const qb = qbMock(exists);
  const repo: any = {
    target: 'Preposto',
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 1, ...v })),
    query: jest.fn().mockResolvedValue([{ total: pedidosEmAndamento }]),
  };
  return { repo, qb, service: new PrepostosService(repo) };
}

const pipe = { whitelist: true, forbidNonWhitelisted: true };

describe('PrepostosService', () => {
  it('cria no tenant do token, com percentual normalizado', async () => {
    const { repo, service } = subject();
    await service.create({ uuid, nome: 'Ana', percentual_comissao: 2.5 } as CreatePrepostoDto, tenantId);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ uuid, tenant_id: tenantId, percentual_comissao: '2.50' }));
  });

  it('recusa CPF/CNPJ já usado por preposto ativo', async () => {
    const { service } = subject({ exists: true });
    await expect(service.create({ uuid, nome: 'Ana', documento: '52998224725', percentual_comissao: 1 } as CreatePrepostoDto, tenantId))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('converte a violação do índice de documento em 409 legível (corrida)', async () => {
    const { repo, service } = subject();
    repo.save.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505', constraint: 'uq_prepostos_tenant_documento_active' }));
    await expect(service.create({ uuid, nome: 'Ana', documento: '52998224725', percentual_comissao: 1 } as CreatePrepostoDto, tenantId))
      .rejects.toThrow('Este CPF/CNPJ já existe no cadastro de prepostos.');
  });

  it('busca por nome, contato e documento, sempre no tenant e sem excluídos', async () => {
    const { qb, service } = subject();
    await service.findAll(tenantId, { page: 1, limit: 20, search: '529.982' });
    expect(qb.where).toHaveBeenCalledWith('p.tenant_id = :tenantId', { tenantId });
    expect(qb.andWhere).toHaveBeenCalledWith('p.deleted_at IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('p.nome ILIKE :search'), expect.any(Object));
  });

  it('atualiza com lock otimista', async () => {
    const { qb, service } = subject();
    await service.update(uuid, { version: 3, percentual_comissao: 4 } as UpdatePrepostoDto, tenantId);
    expect(qb.andWhere).toHaveBeenCalledWith('version = :expectedVersion', { expectedVersion: 3 });
    expect(qb.set).toHaveBeenCalledWith(expect.objectContaining({ percentual_comissao: '4.00' }));
  });

  it('não exclui preposto com comissão pendente', async () => {
    const { repo, service } = subject();
    repo.findOne.mockResolvedValue({ id: 1, uuid, tenant_id: tenantId });
    repo.query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([{ total: 1 }]);
    await expect(service.remove(uuid, 1, tenantId)).rejects.toThrow('comissões pendentes');
  });

  it('não exclui preposto com pedido em andamento', async () => {
    const { repo, service } = subject({ pedidosEmAndamento: 2 });
    repo.findOne.mockResolvedValue({ id: 1, uuid, tenant_id: tenantId });
    await expect(service.remove(uuid, 1, tenantId)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.query.mock.calls[0][1]).toEqual([tenantId, 1, ['em_aberto', 'liberado', 'parcialmente_faturado']]);
  });
});

describe('CreatePrepostoDto', () => {
  it('normaliza documento para dígitos, vazio vira null e valida CPF/CNPJ', async () => {
    const ok = plainToInstance(CreatePrepostoDto, {
      uuid, nome: '  Ana  ', documento: '529.982.247-25', telefone: ' ', email: 'ana@exemplo.com', percentual_comissao: 3,
    });
    expect(await validate(ok, pipe)).toEqual([]);
    expect(ok).toEqual(expect.objectContaining({ nome: 'Ana', documento: '52998224725', telefone: null }));

    const ruim = plainToInstance(CreatePrepostoDto, {
      uuid, nome: 'A', documento: '123', email: 'x', percentual_comissao: 100.5, tenant_id: 'outro',
    });
    expect((await validate(ruim, pipe)).map((e) => e.property).sort())
      .toEqual(['documento', 'email', 'nome', 'percentual_comissao', 'tenant_id']);
  });

  it('update exige versão e não aceita trocar o uuid', async () => {
    const errors = await validate(plainToInstance(UpdatePrepostoDto, { uuid, nome: 'Ana' }), pipe);
    expect(errors.map((e) => e.property).sort()).toEqual(['uuid', 'version']);
  });
});
