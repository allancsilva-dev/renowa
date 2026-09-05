import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../common/types/jwt-payload.type';
import { ImportResultDto } from '../common/csv/import-result.dto';
import { importCnpjEntity, onlyDigits, parseCsvRows, pick } from '../common/csv/csv-import.util';
import { rethrowCnpjUniqueViolation } from '../common/persistence/cnpj-conflict';

const IMPORT_MAX_ROWS = 5000;

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateClientDto, user: RequestUser): Promise<Client> {
    const tenantId = user.tenantId;
    await this.ensureCnpjAvailable(dto.cnpj, tenantId);
    let transportadora_id: number | null = null;

    if (dto.transportadora_uuid) {
      const result = await this.dataSource.query(
        `SELECT id FROM transportadoras WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [dto.transportadora_uuid, tenantId],
      );
      if (result[0]) transportadora_id = result[0].id as number;
    }

    const { transportadora_uuid: _t, uuid, ...rest } = dto;
    const client = this.clientRepo.create({
      ...rest,
      uuid,
      transportadora_id,
      tenant_id: tenantId,
    });
    try {
      return await this.dataSource.transaction(async (manager) => {
        const saved = await manager.getRepository(Client).save(client);
        await this.audit.record({ tenantId, actor: user, action: 'CREATE', resourceType: 'cliente',
          resourceUuid: saved.uuid, fields: Object.keys(rest), purpose: 'Cadastro operacional de cliente' }, manager);
        return saved;
      });
    } catch (error) {
      return rethrowCnpjUniqueViolation(error, 'clientes');
    }
  }

  async findAll(
    user: RequestUser,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResponse<Client>> {
    const { page = 1, limit = 20 } = pagination;
    const tenantId = user.tenantId;

    const qb = this.clientRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.transportadora', 'transportadora')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.deleted_at IS NULL');

    if (search) {
      qb.andWhere(
        '(c.razao_social ILIKE :s OR c.cnpj ILIKE :s OR c.cidade ILIKE :s OR c.contato ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('c.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.audit.record({ tenantId, actor: user, action: 'READ', resourceType: 'cliente',
      fields: ['razao_social', 'cnpj', 'email', 'tel', 'endereco', 'contato'],
      purpose: 'Consulta operacional da carteira de clientes', metadata: { resultCount: data.length } });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, tenantId: string): Promise<Client> {
    const client = await this.clientRepo.findOne({
      where: { uuid, tenant_id: tenantId },
      relations: ['transportadora'],
    });
    if (!client) throw new NotFoundException(`Cliente ${uuid} não encontrado.`);
    return client;
  }

  async findOneForUser(uuid: string, user: RequestUser): Promise<Client> {
    const client = await this.findOne(uuid, user.tenantId);
    await this.audit.record({ tenantId: user.tenantId, actor: user, action: 'READ', resourceType: 'cliente',
      resourceUuid: uuid, fields: ['razao_social', 'cnpj', 'email', 'tel', 'endereco', 'contato'],
      purpose: 'Consulta operacional de cliente' });
    return client;
  }

  async update(uuid: string, dto: UpdateClientDto, user: RequestUser): Promise<Client> {
    const tenantId = user.tenantId;
    const client = await this.findOne(uuid, tenantId);
    const { transportadora_uuid: _t, uuid: _u, ...rest } = dto;
    const changes: Partial<Client> = { ...rest };
    const changesTransport = Object.prototype.hasOwnProperty.call(dto, 'transportadora_uuid');

    if (Object.prototype.hasOwnProperty.call(dto, 'cnpj')) {
      await this.ensureCnpjAvailable(dto.cnpj, tenantId, uuid);
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
      if (changesTransport) {
        changes.transportadora_id = dto.transportadora_uuid
          ? await this.resolveTransport(manager, dto.transportadora_uuid, tenantId)
          : null;
      }

      const repo = manager.getRepository(Client);
      await repo.update({ id: client.id, tenant_id: tenantId }, changes);
      const saved = await repo.findOne({
        where: { id: client.id, tenant_id: tenantId },
        relations: ['transportadora'],
      });
      if (!saved) throw new NotFoundException(`Cliente ${uuid} não encontrado.`);

      await this.audit.record({ tenantId, actor: user, action: 'UPDATE', resourceType: 'cliente',
        resourceUuid: uuid, fields: Object.keys(rest), purpose: 'Atualização operacional de cliente' }, manager);
      return saved;
      });
    } catch (error) {
      return rethrowCnpjUniqueViolation(error, 'clientes');
    }
  }

  async cnpjAvailability(cnpj: string | undefined, tenantId: string, excludeUuid?: string) {
    const digits = onlyDigits(cnpj);
    if (!digits) return { available: true };
    const qb = this.clientRepo.createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.deleted_at IS NULL')
      .andWhere("regexp_replace(COALESCE(c.cnpj, ''), '\\D', '', 'g') = :cnpj", { cnpj: digits });
    if (excludeUuid) qb.andWhere('c.uuid <> :excludeUuid', { excludeUuid });
    return { available: !(await qb.getOne()) };
  }

  private async ensureCnpjAvailable(cnpj: string | null | undefined, tenantId: string, excludeUuid?: string): Promise<void> {
    if (!cnpj) return;
    if (!(await this.cnpjAvailability(cnpj, tenantId, excludeUuid)).available) {
      throw new ConflictException('Este CNPJ já existe no cadastro de clientes.');
    }
  }

  private async resolveTransport(manager: EntityManager, uuid: string, tenantId: string): Promise<number> {
    const result = await manager.query(
      `SELECT id FROM transportadoras WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [uuid, tenantId],
    ) as Array<{ id: number }>;
    if (!result[0]) throw new NotFoundException('Transportadora não encontrada.');
    return result[0].id;
  }

  async remove(uuid: string, user: RequestUser): Promise<void> {
    const tenantId = user.tenantId;
    const client = await this.findOne(uuid, tenantId);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Client).softDelete(client.id);
      await this.audit.record({ tenantId, actor: user, action: 'DELETE', resourceType: 'cliente',
        resourceUuid: uuid, purpose: 'Exclusão operacional de cliente' }, manager);
    });
  }

  /**
   * Importação em massa (.csv). Upsert por CNPJ dentro do tenant. A
   * transportadora é resolvida por CNPJ ou razão social; se não encontrada,
   * o campo fica nulo (a linha não é rejeitada). Falhas por linha não
   * interrompem o processamento.
   */
  async importFromFile(
    file: Express.Multer.File | undefined,
    tenantId: string,
  ): Promise<ImportResultDto> {
    const rows = parseCsvRows(file, IMPORT_MAX_ROWS);

    return this.dataSource.transaction(async (manager) => {
      const resolveTransportId = async (
        cnpjRef: string | undefined,
        nomeRef: string | undefined,
      ): Promise<number | null> => {
        const digits = onlyDigits(cnpjRef);
        if (digits) {
          const byCnpj = await manager.query(
            `SELECT id FROM transportadoras
             WHERE regexp_replace(COALESCE(cnpj, ''), '\\D', '', 'g') = $1
               AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1`,
            [digits, tenantId],
          ) as Array<{ id: number }>;
          if (byCnpj[0]) return byCnpj[0].id;
        }
        if (nomeRef) {
          const byNome = await manager.query(
            `SELECT id FROM transportadoras
             WHERE lower(razao_social) = lower($1)
               AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1`,
            [nomeRef, tenantId],
          ) as Array<{ id: number }>;
          if (byNome[0]) return byNome[0].id;
        }
        return null;
      };

      return importCnpjEntity<Client>({
        rows,
        repo: manager.getRepository(Client),
        tenantId,
        buildFields: async (row) => {
          const razao_social = pick(row, 'razao_social', 'razão_social', 'razao social');
          const cnpj = pick(row, 'cnpj');
          const chave = razao_social ?? cnpj ?? '';
          if (!razao_social) return { erro: 'Razão social é obrigatória.', chave };
          const uf = pick(row, 'uf');
          if (uf !== undefined && uf.length !== 2) return { erro: 'UF deve ter 2 letras.', chave };

          const transportadora_id = await resolveTransportId(
            pick(row, 'transportadora_cnpj', 'transportadora cnpj'),
            pick(row, 'transportadora', 'transportadora_razao_social'),
          );

          return {
            chave,
            cnpj,
            fields: {
              razao_social,
              cnpj: cnpj ?? undefined,
              email: pick(row, 'email', 'e-mail'),
              tel: pick(row, 'tel', 'telefone'),
              endereco: pick(row, 'endereco', 'endereço'),
              numero: pick(row, 'numero', 'número'),
              complemento: pick(row, 'complemento'),
              bairro: pick(row, 'bairro'),
              cidade: pick(row, 'cidade'),
              uf,
              cep: pick(row, 'cep'),
              contato: pick(row, 'contato'),
              inscricao_estadual: pick(row, 'inscricao_estadual', 'inscrição_estadual', 'ie'),
              suframa: pick(row, 'suframa'),
              pgt_padrao: pick(row, 'pgt_padrao', 'pagamento_padrao'),
              prazo: pick(row, 'prazo'),
              local_entrega: pick(row, 'local_entrega'),
              observacao: pick(row, 'observacao', 'observação', 'obs'),
              transportadora_id: transportadora_id ?? undefined,
            },
          };
        },
      });
    });
  }
}
