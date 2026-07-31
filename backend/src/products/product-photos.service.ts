import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductPhoto } from './entities/product-photo.entity';
import { optimisticSoftDelete } from '../common/persistence/optimistic-concurrency';
import { validateImageUpload } from '../common/images/image-validation';

/** Metadados da foto — nunca inclui os bytes. */
export type ProductPhotoMetadata = {
  uuid: string;
  version: number;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  created_at: Date;
};

export type ProductPhotoContent = { buffer: Buffer; mimeType: string; nomeArquivo: string };

/**
 * Foto do catálogo de produto: uma por produto, reaproveitada por todo pedido
 * que use aquele produto.
 *
 * Substituiu as fotos do pedido (0034/0039), onde cada pedido carregava suas
 * próprias imagens e alguém tinha que escolher qual ia ao papel. Aqui não há
 * escolha: o produto tem uma foto, e é ela.
 */
@Injectable()
export class ProductPhotosService {
  constructor(
    @InjectRepository(ProductPhoto) private readonly photoRepo: Repository<ProductPhoto>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
  ) {}

  private async loadProduct(uuid: string, tenantId: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { uuid, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!product) throw new NotFoundException(`Produto ${uuid} não encontrado.`);
    return product;
  }

  private toMetadata(photo: ProductPhoto): ProductPhotoMetadata {
    return {
      uuid: photo.uuid,
      version: photo.version,
      nome_arquivo: photo.nome_arquivo,
      mime_type: photo.mime_type,
      tamanho_bytes: photo.tamanho_bytes,
      created_at: photo.created_at,
    };
  }

  /**
   * Solta a vaga do produto: soft delete da foto ativa com os bytes zerados.
   *
   * `storage_backend = 'purgado'` é o único estado que o CHECK
   * `produto_fotos_storage_check` aceita com `conteudo` e `storage_key` nulos —
   * o mesmo caminho que o ERASURE da LGPD já usava em `pedido_fotos` (0037).
   */
  private async purgeActive(
    manager: EntityManager,
    produtoId: number,
    tenantId: string,
  ): Promise<void> {
    await manager.getRepository(ProductPhoto).createQueryBuilder()
      .update()
      .set({
        deleted_at: () => 'CURRENT_TIMESTAMP',
        version: () => '"version" + 1',
        conteudo: null,
        storage_key: null,
        storage_backend: 'purgado',
      })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('produto_id = :produtoId', { produtoId })
      .andWhere('deleted_at IS NULL')
      .execute();
  }

  /**
   * Metadados da foto atual, ou `null` se o produto não tem foto.
   *
   * `null` em vez de 404 porque "produto sem foto" é o estado normal de quase
   * todo catálogo: a tela pediria a foto e trataria erro no caminho feliz.
   */
  async find(produtoUuid: string, tenantId: string): Promise<ProductPhotoMetadata | null> {
    const product = await this.loadProduct(produtoUuid, tenantId);
    const photo = await this.photoRepo.findOne({
      where: { produto_id: product.id, tenant_id: tenantId, deleted_at: IsNull() },
    });
    return photo ? this.toMetadata(photo) : null;
  }

  /**
   * Grava a foto do produto, substituindo a anterior.
   *
   * Soft delete da atual e insert da nova ficam na MESMA transação, com a linha
   * do produto travada em `pessimistic_write`: sem o lock, duas abas subindo ao
   * mesmo tempo passariam ambas pela exclusão e ambas inseririam. O índice único
   * parcial `uq_produto_fotos_produto` (0040) é a trava final — se as escritas
   * ainda se cruzarem, a segunda falha no banco em vez de deixar duas ativas.
   *
   * O produto é RELIDO dentro da transação, com `tenant_id` no predicado do
   * lock: a leitura de `loadProduct` acontece fora dela, e entre uma e outra o
   * produto pode ter sido excluído. Sem a releitura, a foto entraria para um
   * produto que não existe mais.
   *
   * A anterior é soft-deletada com os bytes zerados (`purgado`), não
   * sobrescrita: a linha fica para auditoria, mas sem carregar o binário para
   * sempre — trocar a foto de um produto muitas vezes não pode virar acúmulo
   * silencioso de megabytes na tabela.
   */
  async upsert(
    produtoUuid: string,
    file: Express.Multer.File | undefined,
    tenantId: string,
  ): Promise<ProductPhotoMetadata> {
    const { buffer, mimeType } = validateImageUpload(file);
    const product = await this.loadProduct(produtoUuid, tenantId);

    const saved = await this.photoRepo.manager.transaction(async (manager) => {
      const travado = await manager.findOne(Product, {
        where: { id: product.id, tenant_id: tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!travado) throw new NotFoundException(`Produto ${produtoUuid} não encontrado.`);

      await this.purgeActive(manager, product.id, tenantId);

      return manager.save(manager.create(ProductPhoto, {
        tenant_id: tenantId,
        produto_id: product.id,
        nome_arquivo: file?.originalname ?? 'foto',
        mime_type: mimeType,
        tamanho_bytes: buffer.length,
        storage_backend: 'db',
        conteudo: buffer,
        storage_key: null,
      }));
    });

    return this.toMetadata(saved);
  }

  async content(produtoUuid: string, tenantId: string): Promise<ProductPhotoContent> {
    const product = await this.loadProduct(produtoUuid, tenantId);
    return this.contentByProductId(product.id, tenantId);
  }

  /**
   * Bytes da foto a partir do id interno do produto.
   *
   * Existe separado porque o papel do pedido chega aqui pelo item, não pelo
   * produto: o módulo de pedidos resolve item → produto e pede os bytes sem
   * passar pela permissão de catálogo.
   */
  async contentByProductId(produtoId: number, tenantId: string): Promise<ProductPhotoContent> {
    const photo = await this.photoRepo.createQueryBuilder('f')
      .addSelect('f.conteudo')
      .where('f.produto_id = :produtoId', { produtoId })
      .andWhere('f.tenant_id = :tenantId', { tenantId })
      .andWhere('f.deleted_at IS NULL')
      .getOne();

    if (!photo?.conteudo) throw new NotFoundException('Produto sem foto cadastrada.');
    return { buffer: photo.conteudo, mimeType: photo.mime_type, nomeArquivo: photo.nome_arquivo };
  }

  /**
   * Remove a foto do produto.
   *
   * O `version` é conferido por `optimisticSoftDelete` antes de qualquer coisa:
   * quem clicou em remover viu uma foto, e se outra aba já trocou a imagem no
   * meio do caminho o 409 é o certo. Só depois os bytes são zerados, na mesma
   * transação.
   */
  async remove(produtoUuid: string, version: number, tenantId: string): Promise<void> {
    const product = await this.loadProduct(produtoUuid, tenantId);
    const photo = await this.photoRepo.findOne({
      where: { produto_id: product.id, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!photo) throw new NotFoundException('Produto sem foto cadastrada.');

    await this.photoRepo.manager.transaction(async (manager) => {
      await optimisticSoftDelete({
        repository: manager.getRepository(ProductPhoto),
        uuid: photo.uuid,
        tenantId,
        expectedVersion: version,
        resource: 'product-photo',
        notFoundMessage: 'Produto sem foto cadastrada.',
      });
      await manager.getRepository(ProductPhoto).createQueryBuilder()
        .update()
        .set({ conteudo: null, storage_key: null, storage_backend: 'purgado' })
        .where('tenant_id = :tenantId', { tenantId })
        .andWhere('uuid = :uuid', { uuid: photo.uuid })
        .execute();
    });
  }

  /**
   * Solta a vaga do produto quando ele é excluído.
   *
   * Sem isto o índice único parcial guarda a vaga de um produto que não existe
   * mais — e a foto continuaria servível por um pedido antigo que o referencie.
   *
   * `manager` é o ponto: a purga zera bytes de forma IRREVERSÍVEL, então ela
   * tem que estar na mesma transação da exclusão do produto que a motivou. Sem
   * isso, falha no soft delete deixa a foto destruída e o produto vivo. Mesmo
   * formato de `AuditService.record`.
   */
  async removeByProductId(
    produtoId: number,
    tenantId: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (manager) return this.purgeActive(manager, produtoId, tenantId);
    await this.photoRepo.manager.transaction((proprio) =>
      this.purgeActive(proprio, produtoId, tenantId));
  }
}
