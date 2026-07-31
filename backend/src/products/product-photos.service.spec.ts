import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductPhotosService } from './product-photos.service';
import { ConcurrentModificationException } from '../common/errors/concurrent-modification.exception';
import {
  fabricaDeBuilders,
  type RespostasDoBuilder,
} from '../common/testing/query-builder.mock';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const tenantId = 'tenant-a';
const produtoUuid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function fileFrom(buffer: Buffer, originalname = 'foto.jpg'): Express.Multer.File {
  return { buffer, originalname, size: buffer.length } as Express.Multer.File;
}

interface SubjectOptions {
  produto?: unknown;
  fotoAtual?: unknown;
  conteudo?: unknown;
  /**
   * Respostas do builder SEM alias — as escritas (UPDATE). `affected: 0` é o que
   * faz a escrita condicional de `optimisticSoftDelete` recusar a versão.
   */
  escrita?: RespostasDoBuilder;
  /** Respostas do builder de alias `record`: a releitura que decide 404 vs 409. */
  releitura?: RespostasDoBuilder;
  /**
   * O que a releitura TRAVADA do produto devolve dentro da transação. Distinto
   * de `produto`: o primeiro decide o 404 antes da transação, este decide o 404
   * quando o produto some entre uma leitura e outra.
   */
  produtoTravado?: unknown;
}

/**
 * Cada `createQueryBuilder()` devolve um builder NOVO, registrado por alias e
 * por ordem. É o que permite (a) exigir um predicado na query CERTA em vez de
 * "alguma query do teste", e (b) responder `affected: 0` só à escrita
 * condicional, sem contaminar a releitura de `version` que vem logo depois.
 */
function subject(options: SubjectOptions = {}) {
  const builders = fabricaDeBuilders({
    padrao: {
      ...options.escrita,
      ...(options.conteudo !== undefined ? { getOne: options.conteudo } : {}),
    },
    porAlias: { record: options.releitura ?? {} },
  });

  const salvos: Array<Record<string, unknown>> = [];
  const manager = {
    query: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(
      'produtoTravado' in options ? options.produtoTravado : { id: 7, uuid: produtoUuid },
    ),
    getRepository: jest.fn(() => ({ createQueryBuilder: builders })),
    create: jest.fn((_entity: unknown, values: Record<string, unknown>) => ({ ...values })),
    save: jest.fn(async (value: Record<string, unknown>) => {
      salvos.push(value);
      return { ...value, uuid: 'foto-uuid', version: 1, created_at: new Date() };
    }),
  };

  const photoRepo = {
    manager: { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)) },
    findOne: jest.fn().mockResolvedValue(options.fotoAtual ?? null),
    createQueryBuilder: builders,
  } as any;

  const productRepo = {
    findOne: jest.fn().mockResolvedValue(
      'produto' in options ? options.produto : { id: 7, uuid: produtoUuid },
    ),
  } as any;

  return {
    service: new ProductPhotosService(photoRepo, productRepo),
    builders,
    manager,
    salvos,
    photoRepo,
    productRepo,
  };
}

describe('ProductPhotosService#upsert', () => {
  it('grava a foto do produto', async () => {
    const { service, salvos } = subject();

    const meta = await service.upsert(produtoUuid, fileFrom(PNG, 'papel.png'), tenantId);

    expect(salvos[0]).toMatchObject({
      tenant_id: tenantId,
      produto_id: 7,
      mime_type: 'image/png',
      storage_backend: 'db',
      nome_arquivo: 'papel.png',
      // Os BYTES e o tamanho: sem estas duas, uma implementação que gravasse
      // buffer vazio passaria no teste. O CHECK do banco pegaria; o teste, não.
      conteudo: PNG,
      tamanho_bytes: PNG.length,
    });
    expect(meta.uuid).toBe('foto-uuid');
    // Metadado não carrega binário — o `select: false` da entidade existe para
    // isto, e quem monta a resposta não pode desfazê-lo.
    expect(meta).not.toHaveProperty('conteudo');
  });

  /**
   * Uma foto por produto: a anterior sai na MESMA transação, com a linha do
   * produto travada. Sem o lock, duas abas passariam ambas pela exclusão e
   * ambas inseririam — aí só o índice único parcial segura.
   */
  it('purga a anterior dentro da transação, com o produto travado', async () => {
    const { service, builders, manager } = subject();

    await service.upsert(produtoUuid, fileFrom(JPEG), tenantId);

    // Lock com `tenant_id` no predicado: um `WHERE id = $1` sozinho tranca a
    // linha certa por acidente (o id veio de busca tenant-scoped) e destoa de
    // todo lock do repositório.
    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: expect.objectContaining({ id: 7, tenant_id: tenantId }),
        lock: { mode: 'pessimistic_write' },
      }),
    );
    // A purga é a ÚNICA query do upsert: asserir nela, e não em "alguma query
    // do teste", é o que dá valor ao predicado abaixo.
    const purga = builders.unico();
    const patch = purga.set.mock.calls[0][0];
    expect(patch).toMatchObject({ conteudo: null, storage_key: null, storage_backend: 'purgado' });
    expect(typeof patch.deleted_at).toBe('function');
    // Sem `deleted_at IS NULL` a purga re-marcaria foto já apagada, inflando
    // `version` sem motivo.
    expect(purga.andWhere).toHaveBeenCalledWith('deleted_at IS NULL');
    expect(purga.andWhere).toHaveBeenCalledWith('produto_id = :produtoId', { produtoId: 7 });
  });

  it('recusa arquivo que não é imagem antes de tocar no banco', async () => {
    const { service, photoRepo } = subject();

    await expect(service.upsert(produtoUuid, fileFrom(Buffer.from('<?php ?>'), 'x.jpg'), tenantId))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(photoRepo.manager.transaction).not.toHaveBeenCalled();
  });

  it('recusa produto de outro tenant com 404', async () => {
    const { service } = subject({ produto: null });

    await expect(service.upsert(produtoUuid, fileFrom(JPEG), tenantId))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * A primeira leitura do produto acontece FORA da transação. Se ele for
   * excluído nessa janela, a releitura travada não acha nada — e a foto não
   * pode entrar para um produto que já não existe.
   */
  it('devolve 404 quando o produto some entre a leitura e o lock, sem gravar nada', async () => {
    const { service, salvos, builders } = subject({ produtoTravado: null });

    await expect(service.upsert(produtoUuid, fileFrom(JPEG), tenantId))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(salvos).toHaveLength(0);
    // Nenhuma query sequer foi montada: o 404 vem antes da purga.
    expect(builders.criados).toHaveLength(0);
  });
});

describe('ProductPhotosService#find', () => {
  it('devolve null quando o produto não tem foto', async () => {
    const { service } = subject();

    await expect(service.find(produtoUuid, tenantId)).resolves.toBeNull();
  });

  it('devolve metadados sem os bytes', async () => {
    const { service } = subject({
      fotoAtual: {
        uuid: 'foto-uuid', version: 3, nome_arquivo: 'p.png', mime_type: 'image/png',
        tamanho_bytes: 10, created_at: new Date(0), conteudo: PNG,
      },
    });

    const meta = await service.find(produtoUuid, tenantId);

    expect(meta).toMatchObject({ uuid: 'foto-uuid', version: 3, tamanho_bytes: 10 });
    expect(meta).not.toHaveProperty('conteudo');
  });
});

describe('ProductPhotosService#content', () => {
  it('devolve os bytes', async () => {
    const { service } = subject({
      conteudo: { conteudo: PNG, mime_type: 'image/png', nome_arquivo: 'p.png' },
    });

    await expect(service.content(produtoUuid, tenantId)).resolves.toEqual({
      buffer: PNG, mimeType: 'image/png', nomeArquivo: 'p.png',
    });
  });

  it('404 quando o produto não tem foto', async () => {
    const { service } = subject();

    await expect(service.content(produtoUuid, tenantId)).rejects.toBeInstanceOf(NotFoundException);
  });

  // Linha 'purgado' tem metadados mas não tem bytes: servir uma resposta vazia
  // seria pior que 404 — o PDF montaria com imagem quebrada.
  it('404 quando a linha existe sem conteúdo', async () => {
    const { service } = subject({
      conteudo: { conteudo: null, mime_type: 'image/png', nome_arquivo: 'p.png' },
    });

    await expect(service.content(produtoUuid, tenantId)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProductPhotosService#remove', () => {
  it('404 quando não há foto', async () => {
    const { service } = subject();

    await expect(service.remove(produtoUuid, 1, tenantId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('zera os bytes junto do soft delete', async () => {
    const { service, builders } = subject({ fotoAtual: { uuid: 'foto-uuid', version: 2 } });

    await service.remove(produtoUuid, 2, tenantId);

    // Duas escritas, nesta ordem: soft delete condicional e purga dos bytes.
    const [softDelete, purga] = builders.porAlias();
    expect(softDelete.andWhere).toHaveBeenCalledWith(
      'version = :expectedVersion', { expectedVersion: 2 },
    );
    expect(purga.set).toHaveBeenCalledWith(
      expect.objectContaining({ conteudo: null, storage_key: null, storage_backend: 'purgado' }),
    );
  });

  /**
   * A garantia central do endpoint, e a que não tinha teste: quem clicou em
   * remover VIU uma foto, e se outra aba trocou a imagem no meio do caminho o
   * certo é recusar. Antes o mock devolvia `affected: 1` fixo, então passar
   * `version` errado passava no teste igual — a asserção de versão era
   * decorativa.
   */
  it('409 quando a version enviada não é a atual — e sem zerar byte nenhum', async () => {
    const { service, builders } = subject({
      fotoAtual: { uuid: 'foto-uuid', version: 5 },
      escrita: { execute: { affected: 0, raw: [] } },
      releitura: { getRawOne: { version: 5 } },
    });

    await expect(service.remove(produtoUuid, 2, tenantId))
      .rejects.toMatchObject({
        response: { code: 'CONCURRENT_MODIFICATION', expectedVersion: 2, currentVersion: 5 },
      });

    // A escrita condicional falhou: a purga NÃO pode ter corrido. Zerar bytes é
    // irreversível, e o 409 existe justamente para impedir isso.
    const purgas = builders.porAlias().filter((builder) => builder.set.mock.calls.some(
      ([patch]: [Record<string, unknown>]) => patch?.storage_backend === 'purgado',
    ));
    expect(purgas).toHaveLength(0);
  });

  it('409 é ConcurrentModificationException, não conflito genérico', async () => {
    const { service } = subject({
      fotoAtual: { uuid: 'foto-uuid', version: 5 },
      escrita: { execute: { affected: 0, raw: [] } },
      releitura: { getRawOne: { version: 5 } },
    });

    await expect(service.remove(produtoUuid, 2, tenantId))
      .rejects.toBeInstanceOf(ConcurrentModificationException);
  });

  // Escrita recusada e releitura vazia: a linha não existe NESTE tenant. 404,
  // não 409 — a resposta não pode revelar que o registro existe em outro lugar.
  it('404 quando a escrita não afeta nada e a releitura não acha a linha', async () => {
    const { service } = subject({
      fotoAtual: { uuid: 'foto-uuid', version: 2 },
      escrita: { execute: { affected: 0, raw: [] } },
      releitura: { getRawOne: undefined },
    });

    await expect(service.remove(produtoUuid, 2, tenantId))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProductPhotosService#removeByProductId', () => {
  /**
   * Chamado quando o produto é excluído: sem isto o índice único parcial
   * guarda a vaga de um produto que não existe mais.
   */
  it('purga a foto ativa do produto', async () => {
    const { service, builders } = subject();

    await service.removeByProductId(7, tenantId);

    const purga = builders.unico();
    expect(purga.set).toHaveBeenCalledWith(
      expect.objectContaining({ conteudo: null, storage_backend: 'purgado' }),
    );
    expect(purga.andWhere).toHaveBeenCalledWith('produto_id = :produtoId', { produtoId: 7 });
  });

  /**
   * A purga zera bytes de forma irreversível. Recebendo manager, ela tem que
   * correr NA transação de quem chamou — se abrisse a própria, o commit
   * aconteceria antes do soft delete do produto, e uma falha ali deixaria a foto
   * destruída com o produto vivo.
   */
  it('com manager externo, não abre transação própria', async () => {
    const { service, photoRepo, manager } = subject();

    await service.removeByProductId(7, tenantId, manager as never);

    expect(photoRepo.manager.transaction).not.toHaveBeenCalled();
    expect(manager.getRepository).toHaveBeenCalled();
  });

  it('sem manager, mantém o contrato antigo e abre a própria transação', async () => {
    const { service, photoRepo } = subject();

    await service.removeByProductId(7, tenantId);

    expect(photoRepo.manager.transaction).toHaveBeenCalledTimes(1);
  });
});
