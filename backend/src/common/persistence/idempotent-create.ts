import {
  DeepPartial, EntityManager, FindOptionsWhere, ObjectLiteral, Repository,
} from 'typeorm';
import { BaseEntity } from '../entities/base.entity';
import { isUniqueViolation } from '../errors/pg-error';

/** Toda entidade do sistema tem `uuid` público e `tenant_id` — ver `BaseEntity`. */
type EntidadeIdentificada = BaseEntity & ObjectLiteral;

interface IdempotentCreateOptions<T extends EntidadeIdentificada> {
  repository: Repository<T>;
  /** Identidade da entidade, escolhida pelo CLIENTE. Nunca gerada aqui. */
  uuid: string;
  tenantId: string;
  /** Monta a linha a inserir. Só é chamado quando a criação é de fato nova. */
  build: () => DeepPartial<T>;
  /**
   * Guardas de negócio que só valem para inserção de verdade — chave natural,
   * limite de plano, o que for. Fica FORA do caminho de replay de propósito: o
   * reenvio de um CREATE não pode ser recusado por colidir com o próprio
   * registro que ele está replicando.
   */
  antesDeInserir?: () => Promise<void>;
  /** Transação já aberta, quando a criação faz parte de uma operação maior. */
  manager?: EntityManager;
}

/**
 * Criação idempotente por uuid do cliente.
 *
 * O uuid da entidade É a chave de idempotência do sistema — a mesma decisão nas
 * duas pontas. Um CREATE reenviado (duplo clique, retry do axios, fila offline
 * do celular que perdeu a resposta) devolve o registro que já existe em vez de
 * criar um segundo ou estourar um 409 que a fila não sabe resolver. É o que o
 * push do sync já fazia (`sync.service.ts`: `ALREADY_EXISTS` no v2, retorno do
 * existente no v1); aqui a rota HTTP passa a falar a mesma língua.
 *
 * Reenvio com payload DIFERENTE também devolve o existente, sem gravar: é
 * replay de um CREATE, não uma edição. Alterar é UPDATE com version — esse
 * caminho tem concorrência otimista e sabe recusar escrita velha.
 *
 * Três desvios que o formato ingênuo (`findOne` + `save`) erra:
 *
 * 1. `withDeleted` é obrigatório na busca. O índice único `(tenant_id, uuid)`
 *    cobre linha soft-deletada; ignorá-la faria o insert bater no índice sem
 *    saída, com o registro logo ali.
 * 2. Duas requisições com o mesmo uuid ao mesmo tempo passam as duas pela
 *    busca. A segunda toma 23505 — e aí a RELEITURA por uuid resolve: achou, é
 *    a linha da concorrente, devolve.
 * 3. Se a releitura NÃO acha, a violação foi de outro índice (código duplicado,
 *    por exemplo) e o erro sobe intacto. É o que separa os dois casos sem
 *    inspecionar nome de constraint, que é detalhe de migration e muda.
 */
export async function createIdempotente<T extends EntidadeIdentificada>(
  options: IdempotentCreateOptions<T>,
): Promise<T> {
  const repo = options.manager?.getRepository(options.repository.target) ?? options.repository;
  // `FindOptionsWhere<T>` exige a forma completa de T em tipo; a busca é pela
  // chave (uuid, tenant_id), que `BaseEntity` garante existir em toda entidade.
  const where = {
    uuid: options.uuid,
    tenant_id: options.tenantId,
  } as unknown as FindOptionsWhere<T>;

  const existente = await repo.findOne({ where, withDeleted: true });
  if (existente) return existente;

  await options.antesDeInserir?.();

  try {
    return await repo.save(repo.create(options.build()));
  } catch (erro) {
    if (!isUniqueViolation(erro)) throw erro;
    const concorrente = await repo.findOne({ where, withDeleted: true });
    if (!concorrente) throw erro;
    return concorrente;
  }
}
