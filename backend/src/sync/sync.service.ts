import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { SyncItemDto, SyncEntity, SyncPullDto } from './dto/sync.dto';
import { Client } from '../clients/entities/client.entity';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Transport } from '../transport/entities/transport.entity';

interface SyncResult {
  uuid: string;
  status: 'ok' | 'error';
  error?: string;
}

/**
 * CHANGELOG #8: Sync por entidade — endpoints separados por tabela.
 * CHANGELOG #4: Transaction por item — falha em um item não afeta os demais.
 * CHANGELOG #12: server_time em todo response de sync.
 * CHANGELOG #3: UUID→ID resolution — mobile envia uuid, servidor resolve para id.
 * CHANGELOG #13: Cursor por offset (limitação conhecida — migrar para cursor por updated_at na v2.0).
 */
@Injectable()
export class SyncService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ──────────────────────────────────────────────
  // PUSH — mobile envia mudanças offline
  // CHANGELOG #4: cada item em sua própria transação
  // ──────────────────────────────────────────────
  async pushItems(
    items: SyncItemDto[],
    tenantId: string,
  ): Promise<{ results: SyncResult[]; server_time: string }> {
    const results: SyncResult[] = [];

    for (const item of items) {
      try {
        await this.dataSource.transaction(async (em) => {
          switch (item.entity) {
            case SyncEntity.CLIENTES:
              await this.upsertEntity(em.getRepository(Client), item, tenantId);
              break;
            case SyncEntity.PRODUTOS:
              await this.upsertEntity(em.getRepository(Product), item, tenantId);
              break;
            case SyncEntity.FORNECEDORES:
              await this.upsertEntity(em.getRepository(Supplier), item, tenantId);
              break;
            case SyncEntity.TRANSPORTADORAS:
              await this.upsertEntity(em.getRepository(Transport), item, tenantId);
              break;
            case SyncEntity.PEDIDOS:
              await this.upsertEntity(em.getRepository(Order), item, tenantId);
              break;
            default:
              throw new BadRequestException(`Entidade desconhecida: ${item.entity as string}`);
          }
        });

        results.push({ uuid: item.uuid, status: 'ok' });
      } catch (err) {
        // CHANGELOG #4: erro em um item não propaga — processa os demais
        results.push({
          uuid: item.uuid,
          status: 'error',
          error: err instanceof Error ? err.message : 'Erro desconhecido',
        });
      }
    }

    return { results, server_time: new Date().toISOString() };
  }

  private async upsertEntity<T extends { uuid: string; tenant_id: string }>(
    repo: Repository<T>,
    item: SyncItemDto,
    tenantId: string,
  ): Promise<void> {
    if (item.operation === 'DELETE') {
      await repo
        .createQueryBuilder()
        .softDelete()
        .where('uuid = :uuid AND tenant_id = :tenantId', { uuid: item.uuid, tenantId })
        .execute();
      return;
    }

    const existing = await repo.findOne({
      where: { uuid: item.uuid, tenant_id: tenantId } as Parameters<typeof repo.findOne>[0]['where'],
    });

    if (existing) {
      await repo.update(
        (existing as { id: number }).id,
        { ...item.payload, tenant_id: tenantId } as Parameters<typeof repo.update>[1],
      );
    } else {
      const entity = repo.create({
        ...item.payload,
        uuid: item.uuid,
        tenant_id: tenantId,
      } as Parameters<typeof repo.create>[0]);
      await repo.save(entity);
    }
  }

  // ──────────────────────────────────────────────
  // PULL — mobile busca deltas por entidade
  // CHANGELOG #8: endpoint separado por entidade
  // CHANGELOG #12: server_time em todo response
  // CHANGELOG #13: cursor por offset (limitação documentada)
  // ──────────────────────────────────────────────
  async pullEntity<T extends object>(
    entityClass: new () => T,
    dto: SyncPullDto,
    tenantId: string,
  ): Promise<{
    data: T[];
    meta: { total: number; page: number; limit: number; hasMore: boolean };
    server_time: string;
  }> {
    const repo = this.dataSource.getRepository(entityClass);
    const { since, page = 1, limit = 100 } = dto;

    const qb = repo
      .createQueryBuilder('e')
      .withDeleted()   // inclui soft-deleted para o mobile poder deletar localmente
      .where('e.tenant_id = :tenantId', { tenantId });

    if (since) {
      // CHANGELOG #12: mobile usa server_time como âncora — nunca new Date() do dispositivo
      qb.andWhere('e.updated_at > :since', { since });
    }

    const [data, total] = await qb
      .orderBy('e.updated_at', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        hasMore: page * limit < total,
      },
      // CHANGELOG #12: server_time retornado — mobile usa como próximo cursor
      server_time: new Date().toISOString(),
    };
  }
}
