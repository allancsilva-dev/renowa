import { Repository } from 'typeorm';
import { createIdempotente } from './idempotent-create';
import { BaseEntity } from '../entities/base.entity';

class Registro extends BaseEntity {
  nome: string;
}

const uuid = '2a1f0f2e-0b6c-4f8e-9b3d-6e5a4c3b2a19';
const tenantId = '99c78197-3701-4e23-ab36-3ae34f268cc5';

function violacaoDeUnicidade() {
  return Object.assign(new Error('duplicate key'), { code: '23505' });
}

function repositorio(overrides: Partial<Record<'findOne' | 'save' | 'create', jest.Mock>> = {}) {
  const repo = {
    target: Registro,
    findOne: overrides.findOne ?? jest.fn().mockResolvedValue(null),
    create: overrides.create ?? jest.fn((valor: unknown) => valor),
    save: overrides.save ?? jest.fn(async (valor: unknown) => valor),
  };
  return repo as unknown as Repository<Registro> & Record<string, jest.Mock>;
}

const entrada = (repository: Repository<Registro>, extras = {}) => ({
  repository,
  uuid,
  tenantId,
  build: () => ({ uuid, tenant_id: tenantId, nome: 'novo' }),
  ...extras,
});

describe('createIdempotente', () => {
  it('insere quando o uuid ainda não existe', async () => {
    const repo = repositorio();

    await expect(createIdempotente(entrada(repo))).resolves.toMatchObject({ nome: 'novo' });

    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('devolve o existente sem gravar — replay do mesmo CREATE', async () => {
    const existente = { id: 1, uuid, tenant_id: tenantId, nome: 'gravado antes' };
    const repo = repositorio({ findOne: jest.fn().mockResolvedValue(existente) });

    await expect(createIdempotente(entrada(repo))).resolves.toBe(existente);

    expect(repo.save).not.toHaveBeenCalled();
  });

  /**
   * Payload diferente também é replay: alterar é UPDATE com version, que sabe
   * recusar escrita velha. Aceitar a gravação aqui seria last-write-wins
   * silencioso, com a fila offline decidindo o resultado pela ordem de chegada.
   */
  it('replay com payload diferente não sobrescreve nada', async () => {
    const existente = { id: 1, uuid, tenant_id: tenantId, nome: 'original' };
    const repo = repositorio({ findOne: jest.fn().mockResolvedValue(existente) });

    const resultado = await createIdempotente(
      entrada(repo, { build: () => ({ uuid, tenant_id: tenantId, nome: 'divergente' }) }),
    );

    expect(resultado).toBe(existente);
    expect(repo.save).not.toHaveBeenCalled();
  });

  /**
   * O índice único `(tenant_id, uuid)` cobre linha soft-deletada. Sem
   * `withDeleted`, a busca não enxergaria o registro apagado e o insert bateria
   * no índice sem saída — com o registro ali do lado.
   */
  it('busca inclui registro soft-deletado', async () => {
    const repo = repositorio();

    await createIdempotente(entrada(repo));

    expect(repo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true, where: { uuid, tenant_id: tenantId } }),
    );
  });

  it('corrida no mesmo uuid: 23505 vira releitura e devolve o da concorrente', async () => {
    const concorrente = { id: 2, uuid, tenant_id: tenantId, nome: 'da outra requisição' };
    const findOne = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(concorrente);
    const repo = repositorio({
      findOne,
      save: jest.fn().mockRejectedValue(violacaoDeUnicidade()),
    });

    await expect(createIdempotente(entrada(repo))).resolves.toBe(concorrente);
  });

  /**
   * 23505 de outro índice (chave natural, por exemplo) não é replay: não há
   * registro com aquele uuid para devolver. Engolir o erro daria falso sucesso.
   */
  it('23505 de outro índice sobe intacto', async () => {
    const violacao = violacaoDeUnicidade();
    const repo = repositorio({
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockRejectedValue(violacao),
    });

    await expect(createIdempotente(entrada(repo))).rejects.toBe(violacao);
  });

  it('erro que não é violação de unicidade sobe sem releitura', async () => {
    const falha = Object.assign(new Error('connection reset'), { code: '08006' });
    const findOne = jest.fn().mockResolvedValue(null);
    const repo = repositorio({ findOne, save: jest.fn().mockRejectedValue(falha) });

    await expect(createIdempotente(entrada(repo))).rejects.toBe(falha);
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('as guardas de negócio não correm no replay', async () => {
    const existente = { id: 1, uuid, tenant_id: tenantId, nome: 'existente' };
    const repo = repositorio({ findOne: jest.fn().mockResolvedValue(existente) });
    const antesDeInserir = jest.fn().mockResolvedValue(undefined);

    await createIdempotente(entrada(repo, { antesDeInserir }));

    expect(antesDeInserir).not.toHaveBeenCalled();
  });

  it('as guardas de negócio correm antes da inserção de verdade', async () => {
    const repo = repositorio();
    const ordem: string[] = [];
    const antesDeInserir = jest.fn(async () => { ordem.push('guarda'); });
    (repo.save as jest.Mock).mockImplementation(async (valor: unknown) => {
      ordem.push('save');
      return valor;
    });

    await createIdempotente(entrada(repo, { antesDeInserir }));

    expect(ordem).toEqual(['guarda', 'save']);
  });

  it('recusa da guarda impede a gravação', async () => {
    const repo = repositorio();
    const recusa = new Error('código já usado');

    await expect(createIdempotente(
      entrada(repo, { antesDeInserir: jest.fn().mockRejectedValue(recusa) }),
    )).rejects.toBe(recusa);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('usa o repositório da transação quando recebe manager', async () => {
    const repoDaTransacao = repositorio();
    const manager = { getRepository: jest.fn(() => repoDaTransacao) };
    const repoSolto = repositorio();

    await createIdempotente(entrada(repoSolto, { manager }));

    expect(manager.getRepository).toHaveBeenCalledWith(Registro);
    expect(repoDaTransacao.save).toHaveBeenCalledTimes(1);
    expect(repoSolto.save).not.toHaveBeenCalled();
  });
});
