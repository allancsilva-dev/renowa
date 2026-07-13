import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../common/types/jwt-payload.type';
import { CreateLgpdRequestDto, DenyLgpdRequestDto, ReviewLgpdRequestDto } from './dto/create-lgpd-request.dto';
import { LgpdRequest } from './entities/lgpd-request.entity';

const CLIENT_FIELDS = ['razao_social','cnpj','email','tel','endereco','bairro','cidade','uf','cep','contato','inscricao_estadual','suframa','pgt_padrao','prazo','local_entrega','observacao'];
const USER_FIELDS = ['email', 'nome', 'senha_hash', 'roles', 'is_active'];
const ORDER_FIELDS = ['pgt', 'prazo', 'local_entrega', 'observacao'];

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
          if (request.subject_type === 'CLIENT') {
            const marker = `Titular anonimizado ${request.subject_uuid.slice(0, 8)}`;
            const rows = await manager.query(`UPDATE clientes SET razao_social = $3, cnpj = NULL, email = NULL,
              tel = NULL, endereco = NULL, bairro = NULL, cidade = NULL, uf = NULL, cep = NULL, contato = NULL,
              inscricao_estadual = NULL, suframa = NULL, pgt_padrao = NULL, prazo = NULL, local_entrega = NULL,
              observacao = NULL, deleted_at = COALESCE(deleted_at, clock_timestamp()), version = version + 1
              WHERE tenant_id = $1 AND uuid = $2 RETURNING id`, [user.tenantId, request.subject_uuid, marker]);
            if (!rows[0]) throw new NotFoundException('Titular nao encontrado.');
            await manager.query(`UPDATE pedidos SET pgt = NULL, prazo = NULL, local_entrega = NULL, observacao = NULL,
              version = version + 1 WHERE tenant_id = $1 AND cliente_id = $2`, [user.tenantId, rows[0].id]);
            request.result = { strategy: 'ANONYMIZED_WITH_RELATIONS_RETAINED', fieldsRemoved: CLIENT_FIELDS.length + ORDER_FIELDS.length };
            await this.audit.record({ tenantId: user.tenantId, actor: user, action: 'DELETE', resourceType: 'cliente',
              resourceUuid: request.subject_uuid, fields: [...CLIENT_FIELDS, ...ORDER_FIELDS], purpose: 'Direito de apagamento aprovado' }, manager);
          } else {
            const email = `anon-${request.subject_uuid}@invalid.local`;
            const rows = await manager.query(`UPDATE usuarios SET email = $3, nome = 'Titular anonimizado', senha_hash = NULL,
              roles = '[]'::jsonb, is_active = false, deleted_at = COALESCE(deleted_at, clock_timestamp())
              WHERE tenant_id = $1 AND uuid = $2 RETURNING id`, [user.tenantId, request.subject_uuid, email]);
            if (!rows[0]) throw new NotFoundException('Titular nao encontrado.');
            await manager.query('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, clock_timestamp()) WHERE tenant_id = $1 AND user_id = $2', [user.tenantId, rows[0].id]);
            await manager.query('UPDATE mobile_sessions SET is_active = false, token_version = token_version + 1 WHERE tenant_id = $1 AND user_uuid = $2', [user.tenantId, request.subject_uuid]);
            request.result = { strategy: 'ANONYMIZED_AND_SESSIONS_REVOKED', fieldsRemoved: USER_FIELDS.length };
            await this.audit.record({ tenantId: user.tenantId, actor: user, action: 'DELETE', resourceType: 'usuario',
              resourceUuid: request.subject_uuid, fields: USER_FIELDS, purpose: 'Direito de apagamento aprovado' }, manager);
          }
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

  private async transition(requestUuid: string, tenantId: string, allowed: string[], status: LgpdRequest['status'], patch: Partial<LgpdRequest>) {
    const request = await this.repo.findOne({ where: { request_uuid: requestUuid, tenant_id: tenantId } });
    if (!request) throw new NotFoundException('Solicitacao LGPD nao encontrada.');
    if (request.status === status) return request;
    if (!allowed.includes(request.status)) throw new ConflictException(`Transicao invalida: ${request.status} para ${status}.`);
    Object.assign(request, patch, { status });
    return this.repo.save(request);
  }
}
