import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../common/types/jwt-payload.type';
import { CreateLgpdRequestDto, DenyLgpdRequestDto, ReviewLgpdRequestDto } from './dto/create-lgpd-request.dto';
import { LgpdRequest } from './entities/lgpd-request.entity';
import { buildErasureSql, markerFor, plansFor, SubjectType } from './pii-registry';

@Injectable()
export class PrivacyService {
  constructor(
    @InjectRepository(LgpdRequest) private readonly repo: Repository<LgpdRequest>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string) {
    return this.repo.find({ where: { tenant_id: tenantId }, order: { created_at: 'DESC' }, take: 100 });
  }

  async create(dto: CreateLgpdRequestDto, user: RequestUser) {
    const table = dto.subjectType === 'CLIENT' ? 'clientes' : 'usuarios';
    const subject = await this.dataSource.query(
      `SELECT uuid FROM ${table} WHERE tenant_id = $1 AND uuid = $2`,
      [user.tenantId, dto.subjectUuid],
    );
    if (!subject[0]) throw new NotFoundException('Titular nao encontrado neste tenant.');
    const active = await this.repo.createQueryBuilder('request')
      .where('request.tenant_id = :tenantId AND request.subject_type = :subjectType AND request.subject_uuid = :subjectUuid AND request.request_type = :requestType',
        { tenantId: user.tenantId, subjectType: dto.subjectType, subjectUuid: dto.subjectUuid, requestType: dto.requestType })
      .andWhere("request.status NOT IN ('COMPLETED','DENIED','FAILED')").getOne();
    if (active) return active;
    return this.repo.save(this.repo.create({ tenant_id: user.tenantId, subject_type: dto.subjectType,
      subject_uuid: dto.subjectUuid, request_type: dto.requestType, requested_by: user.sub,
      reason: dto.reason ?? null, status: 'RECEIVED', result: {} }));
  }

  async verify(requestUuid: string, user: RequestUser) {
    return this.transition(requestUuid, user.tenantId, ['RECEIVED'], 'IDENTITY_VERIFIED', { reviewed_by: user.sub });
  }

  async approve(requestUuid: string, dto: ReviewLgpdRequestDto, user: RequestUser) {
    return this.transition(requestUuid, user.tenantId, ['IDENTITY_VERIFIED'], 'APPROVED', { reviewed_by: user.sub, legal_basis: dto.legalBasis });
  }

  async deny(requestUuid: string, dto: DenyLgpdRequestDto, user: RequestUser) {
    return this.transition(requestUuid, user.tenantId, ['RECEIVED','IDENTITY_VERIFIED'], 'DENIED',
      { reviewed_by: user.sub, legal_basis: dto.legalBasis, reason: dto.reason, completed_at: new Date() });
  }

  async execute(requestUuid: string, user: RequestUser) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        let exportData: Record<string, unknown> | undefined;
        const repo = manager.getRepository(LgpdRequest);
        const request = await repo.createQueryBuilder('request').setLock('pessimistic_write')
          .where('request.request_uuid = :requestUuid AND request.tenant_id = :tenantId', { requestUuid, tenantId: user.tenantId }).getOne();
        if (!request) throw new NotFoundException('Solicitacao LGPD nao encontrada.');
        if (request.status === 'COMPLETED') return request;
        if (request.status !== 'APPROVED') throw new ConflictException('Solicitacao precisa estar aprovada.');
        request.status = 'IN_PROGRESS';
        await repo.save(request);

        if (request.request_type === 'ERASURE') {
          const subject = request.subject_type;
          const purgadas = await this.runErasure(manager, user.tenantId, subject, request.subject_uuid);

          request.result = subject === 'CLIENT'
            ? { strategy: 'ANONYMIZED_WITH_RELATIONS_RETAINED', fieldsRemoved: purgadas.length }
            : { strategy: 'ANONYMIZED_AND_SESSIONS_REVOKED', fieldsRemoved: purgadas.length };

          await this.audit.record({
            tenantId: user.tenantId, actor: user, action: 'DELETE',
            resourceType: subject === 'CLIENT' ? 'cliente' : 'usuario',
            resourceUuid: request.subject_uuid, fields: purgadas,
            purpose: 'Direito de apagamento aprovado',
          }, manager);
        } else {
          const rows = request.subject_type === 'CLIENT'
            ? await manager.query(`SELECT uuid, razao_social, cnpj, email, tel, endereco, bairro, cidade, uf,
              cep, contato, inscricao_estadual, suframa, created_at, updated_at FROM clientes WHERE tenant_id = $1 AND uuid = $2`, [user.tenantId, request.subject_uuid])
            : await manager.query(`SELECT uuid, email, nome, roles, is_active, created_at, updated_at
              FROM usuarios WHERE tenant_id = $1 AND uuid = $2`, [user.tenantId, request.subject_uuid]);
          if (!rows[0]) throw new NotFoundException('Titular nao encontrado.');
          exportData = rows[0] as Record<string, unknown>;
          request.result = { format: 'JSON', generatedAt: new Date().toISOString(), deliveredInline: true };
          await this.audit.record({ tenantId: user.tenantId, actor: user, action: 'EXPORT', resourceType: request.subject_type.toLowerCase(),
            resourceUuid: request.subject_uuid, fields: Object.keys(rows[0]), purpose: 'Portabilidade aprovada pelo titular' }, manager);
        }
        request.status = 'COMPLETED';
        request.completed_at = new Date();
        request.failure_reason = null;
        const saved = await repo.save(request);
        return exportData ? { request: saved, exportData } : { request: saved };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'Falha desconhecida';
      await this.repo.createQueryBuilder().update().set({ status: 'FAILED', failure_reason: message, completed_at: new Date() })
        .where('request_uuid = :requestUuid AND tenant_id = :tenantId AND status = :status',
          { requestUuid, tenantId: user.tenantId, status: 'APPROVED' }).execute();
      throw error;
    }
  }

  /**
   * Executa o apagamento gerando o SQL a partir de `PII_REGISTRY` (PROB-0075).
   *
   * A ordem importa: o primeiro plano do ramo é a tabela do próprio titular, e
   * é o `RETURNING id` dela que dá o id interno usado pelas demais. Se o titular
   * não existir, nada mais roda.
   *
   * @returns os campos efetivamente purgados, em `tabela.coluna`, para a trilha
   * de auditoria. Antes eram duas constantes mantidas à mão, que já divergiam do
   * SQL real.
   */
  private async runErasure(
    manager: EntityManager,
    tenantId: string,
    subject: SubjectType,
    subjectUuid: string,
  ): Promise<string[]> {
    const planos = plansFor(subject);
    const marker = markerFor(subject, subjectUuid);
    const purgadas: string[] = [];
    let subjectId: number | undefined;

    for (const plano of planos) {
      const sql = buildErasureSql(plano);
      const chave = plano.vinculo.kind === 'own-uuid' ? subjectUuid : subjectId;

      if (chave === undefined) {
        // Só acontece se o registro for reordenado e a tabela do titular deixar
        // de ser a primeira. Falhar alto é melhor que apagar pela metade.
        throw new Error(`Plano de ${plano.table} precisa do id do titular, ainda não resolvido.`);
      }

      const usaMarcador = Object.values(plano.columns).some((e) => e.set === 'marker');
      const parametros = usaMarcador ? [tenantId, chave, marker] : [tenantId, chave];

      if (plano.vinculo.kind === 'own-uuid' && subjectId === undefined) {
        const rows = await manager.query(`${sql} RETURNING id`, parametros);
        if (!rows[0]) throw new NotFoundException('Titular nao encontrado.');
        subjectId = rows[0].id as number;
      } else {
        await manager.query(sql, parametros);
      }

      purgadas.push(...Object.keys(plano.columns).map((coluna) => `${plano.table}.${coluna}`));
    }

    return purgadas;
  }

  private async transition(requestUuid: string, tenantId: string, allowed: string[], status: LgpdRequest['status'], patch: Partial<LgpdRequest>) {
    const request = await this.repo.findOne({ where: { request_uuid: requestUuid, tenant_id: tenantId } });
    if (!request) throw new NotFoundException('Solicitacao LGPD nao encontrada.');
    if (request.status === status) return request;
    if (!allowed.includes(request.status)) throw new ConflictException(`Transicao invalida: ${request.status} para ${status}.`);
    Object.assign(request, patch, { status });
    return this.repo.save(request);
  }
}
