import 'reflect-metadata';
import { PrivacyService } from './privacy.service';
import { LgpdRequest } from './entities/lgpd-request.entity';

/**
 * ERASURE é o único fluxo destrutivo do sistema e não tinha spec nenhuma (m6 da
 * auditoria de 2026-07-29): existia `privacy.controller.spec.ts`, que cobre
 * rota e permissão, e nada sobre o SQL que apaga o dado.
 *
 * Esta suíte foi escrita ANTES de `privacy.service.ts` passar a gerar o SQL a
 * partir de `pii-registry.ts`, justamente para travar o comportamento anterior:
 * as tabelas já cobertas (`clientes`, `pedidos`, `usuarios`, `local_users`,
 * `refresh_tokens`, `mobile_sessions`) têm que receber exatamente as mesmas
 * atribuições depois do refactor. Se algum `SET` mudar de forma silenciosa, o
 * caso correspondente quebra.
 *
 * As tabelas de `pedido_fotos` / SAC são a parte nova (PROB-0075).
 */
describe('PrivacyService.execute — ERASURE', () => {
  const SUBJECT = '3f2b1c9d-1111-2222-3333-444455556666';

  /** Só o que importa para comparar SQL: espaços colapsados. */
  const normalizar = (sql: string) => sql.replace(/\s+/g, ' ').trim();

  function subject(subjectType: 'CLIENT' | 'USER', resultados: unknown[][]) {
    const query = jest.fn().mockImplementation(() => Promise.resolve(resultados.shift() ?? []));
    const request = {
      request_uuid: 'aaaaaaaa-0000-0000-0000-000000000000',
      subject_uuid: SUBJECT,
      subject_type: subjectType,
      request_type: 'ERASURE',
      status: 'APPROVED',
      result: {},
    } as unknown as LgpdRequest;

    const save = jest.fn(async (entidade: LgpdRequest) => entidade);
    const manager = {
      getRepository: () => ({
        createQueryBuilder: () => ({
          setLock: () => ({ where: () => ({ getOne: async () => request }) }),
        }),
        save,
      }),
      query,
    };

    // Caminho de falha: `execute` marca a solicitação como FAILED pelo repo do
    // construtor, fora da transação que acabou de sofrer rollback.
    const repo = {
      createQueryBuilder: () => ({
        update: () => ({ set: () => ({ where: () => ({ execute: jest.fn() }) }) }),
      }),
    };

    const audit = { record: jest.fn() };
    const service = new PrivacyService(
      repo as never,
      { transaction: (cb: (m: unknown) => unknown) => cb(manager) } as never,
      audit as never,
    );

    return { service, query, request, audit };
  }

  const user = { tenantId: 'tenant-1', sub: 'operador-1' } as never;

  /** Comandos emitidos, na ordem, como `{ tabela, sql }`. */
  function comandos(query: jest.Mock) {
    return query.mock.calls
      .map(([sql]) => normalizar(String(sql)))
      .filter((sql) => sql.startsWith('UPDATE'))
      .map((sql) => ({ tabela: /^UPDATE ([a-z_]+)/.exec(sql)?.[1] ?? '', sql }));
  }

  describe('titular CLIENT', () => {
    // `RETURNING id` do UPDATE em clientes alimenta os UPDATEs das tabelas-filha.
    const executar = async () => {
      const ctx = subject('CLIENT', [[{ id: 7 }]]);
      await ctx.service.execute(ctx.request.request_uuid, user);
      return ctx;
    };

    it('anonimiza clientes com marcador derivado do uuid do titular', async () => {
      const { query } = await executar();
      const alvo = comandos(query).find((c) => c.tabela === 'clientes');

      expect(alvo).toBeDefined();
      for (const coluna of [
        'cnpj', 'email', 'tel', 'endereco', 'bairro', 'cidade', 'uf', 'cep', 'contato',
        'inscricao_estadual', 'suframa', 'pgt_padrao', 'prazo', 'local_entrega', 'observacao',
      ]) {
        expect(alvo?.sql).toContain(`${coluna} = NULL`);
      }
      expect(alvo?.sql).toContain('razao_social = $3');
      expect(alvo?.sql).toContain('deleted_at = COALESCE(deleted_at, clock_timestamp())');
      expect(alvo?.sql).toContain('version = version + 1');
      expect(alvo?.sql).toContain('WHERE tenant_id = $1 AND uuid = $2');

      const parametros = query.mock.calls[0][1] as unknown[];
      expect(parametros[2]).toBe(`Titular anonimizado ${SUBJECT.slice(0, 8)}`);
    });

    it('limpa os campos livres do pedido sem apagar o pedido', async () => {
      const { query } = await executar();
      const alvo = comandos(query).find((c) => c.tabela === 'pedidos');

      expect(alvo?.sql).toContain('pgt = NULL');
      expect(alvo?.sql).toContain('prazo = NULL');
      expect(alvo?.sql).toContain('local_entrega = NULL');
      expect(alvo?.sql).toContain('observacao = NULL');
      expect(alvo?.sql).toContain('version = version + 1');
      expect(alvo?.sql).toContain('WHERE tenant_id = $1 AND cliente_id = $2');
      // Relação preservada é a estratégia declarada; DELETE aqui quebraria o
      // histórico de faturamento.
      expect(alvo?.sql).not.toContain('deleted_at');
    });

    // PROB-0075: o `bytea` da foto sobrevivia a um ERASURE concluído com
    // sucesso. Uma foto de nota fiscal traz nome, CNPJ e endereço no pixel.
    it('purga o conteúdo das fotos do pedido', async () => {
      const { query } = await executar();
      const alvo = comandos(query).find((c) => c.tabela === 'pedido_fotos');

      expect(alvo).toBeDefined();
      expect(alvo?.sql).toContain('conteudo = NULL');
      expect(alvo?.sql).toContain("storage_backend = 'purgado'");
      expect(alvo?.sql).toContain('storage_key = NULL');
      // O nome do arquivo também carrega PII: "nota-fiscal-ACME-LTDA.jpg".
      expect(alvo?.sql).toContain('nome_arquivo = $3');
      expect(alvo?.sql).toContain('deleted_at = COALESCE(deleted_at, clock_timestamp())');
      expect(alvo?.sql).toContain('version = version + 1');
    });

    it('anonimiza chamados de SAC do titular', async () => {
      const { query } = await executar();
      const alvo = comandos(query).find((c) => c.tabela === 'chamados_sac');

      expect(alvo).toBeDefined();
      expect(alvo?.sql).toContain('observacao = NULL');
      expect(alvo?.sql).toContain('numero_nfe = NULL');
      expect(alvo?.sql).toContain('version = version + 1');
    });

    // `itens_chamado_sac.motivo` é NOT NULL (0035:90): NULL abortaria com 23502.
    it('substitui o motivo do item de SAC por literal, nunca NULL', async () => {
      const { query } = await executar();
      const alvo = comandos(query).find((c) => c.tabela === 'itens_chamado_sac');

      expect(alvo).toBeDefined();
      expect(alvo?.sql).toContain("motivo = '[removido - LGPD]'");
      expect(alvo?.sql).not.toContain('motivo = NULL');
    });

    it('registra auditoria de DELETE com os campos removidos', async () => {
      const { audit } = await executar();

      expect(audit.record).toHaveBeenCalledTimes(1);
      const evento = audit.record.mock.calls[0][0] as {
        action: string; resourceType: string; resourceUuid: string; fields: string[];
      };
      expect(evento.action).toBe('DELETE');
      expect(evento.resourceType).toBe('cliente');
      expect(evento.resourceUuid).toBe(SUBJECT);
      // Qualificado por tabela. A lista antiga do ramo CLIENT era só o nome da
      // coluna, e `prazo` existe em `clientes` E em `pedidos`: a trilha não
      // dizia qual das duas tinha sido purgada. O ramo USER já era qualificado.
      expect(evento.fields).toContain('clientes.razao_social');
      expect(evento.fields).toContain('pedidos.observacao');
      expect(evento.fields).toContain('pedido_fotos.conteudo');
      expect(evento.fields).toContain('itens_chamado_sac.motivo');
    });

    it('marca a solicitação como COMPLETED com a estratégia declarada', async () => {
      const { request } = await executar();

      expect(request.status).toBe('COMPLETED');
      expect(request.result).toMatchObject({ strategy: 'ANONYMIZED_WITH_RELATIONS_RETAINED' });
      expect((request.result as { fieldsRemoved: number }).fieldsRemoved).toBeGreaterThan(0);
    });
  });

  describe('titular USER', () => {
    const executar = async () => {
      const ctx = subject('USER', [[{ id: 3 }]]);
      await ctx.service.execute(ctx.request.request_uuid, user);
      return ctx;
    };

    it('anonimiza usuarios e invalida o token de acesso', async () => {
      const { query } = await executar();
      const alvo = comandos(query).find((c) => c.tabela === 'usuarios');

      expect(alvo?.sql).toContain('email = $3');
      expect(alvo?.sql).toContain("nome = 'Titular anonimizado'");
      expect(alvo?.sql).toContain('senha_hash = NULL');
      expect(alvo?.sql).toContain("roles = '[]'::jsonb");
      expect(alvo?.sql).toContain('is_active = false');
      // Sem o bump, um token já emitido continua válido depois do apagamento.
      expect(alvo?.sql).toContain('access_token_version = access_token_version + 1');
      expect(alvo?.sql).toContain('deleted_at = COALESCE(deleted_at, clock_timestamp())');

      const parametros = query.mock.calls[0][1] as unknown[];
      expect(parametros[2]).toBe(`anon-${SUBJECT}@invalid.local`);
    });

    it('desativa o local_user correspondente', async () => {
      const { query } = await executar();
      const alvo = comandos(query).find((c) => c.tabela === 'local_users');

      expect(alvo?.sql).toContain('email = $3');
      expect(alvo?.sql).toContain('active = false');
      expect(alvo?.sql).toContain('WHERE tenant_id = $1 AND auth_user_id = $2');
    });

    it('revoga refresh tokens e sessões mobile', async () => {
      const { query } = await executar();
      const emitidos = comandos(query);

      expect(emitidos.find((c) => c.tabela === 'refresh_tokens')?.sql)
        .toContain('revoked_at = COALESCE(revoked_at, clock_timestamp())');
      expect(emitidos.find((c) => c.tabela === 'mobile_sessions')?.sql)
        .toContain('token_version = token_version + 1');
      expect(emitidos.find((c) => c.tabela === 'mobile_sessions')?.sql)
        .toContain('is_active = false');
    });

    it('não toca em tabelas do ramo CLIENT', async () => {
      const { query } = await executar();
      const tabelas = comandos(query).map((c) => c.tabela);

      expect(tabelas).not.toContain('clientes');
      expect(tabelas).not.toContain('pedido_fotos');
      expect(tabelas).not.toContain('chamados_sac');
    });
  });

  it('aborta quando o titular não existe', async () => {
    const { service, request } = subject('CLIENT', [[]]);

    await expect(service.execute(request.request_uuid, user)).rejects.toThrow('Titular nao encontrado');
  });
});
