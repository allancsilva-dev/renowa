# ADR — Push v2: concorrência, idempotência e erros

- **Status:** aceito para implementação local
- **Data:** 2026-07-12
- **Escopo:** backend agora; mobile futuro

## Contexto

Push v1 resolve conflito por `client_timestamp`. Relógio incorreto do dispositivo pode perder edição. Dois syncs simultâneos também podem reenviar mesma mutação. Falhas permanentes não possuem classificação estável para dead-letter.

Pull v2 já oferece change feed monotônico, cursor por entidade e `highWatermark`. Escritas web em entidades críticas já usam concorrência otimista.

## Decisão

1. Toda entidade sincronizável possui `version` emitida pelo servidor.
2. UPDATE e DELETE exigem `base_version`; escrita usa comparação atômica e incrementa `version`.
3. Conflito retorna `VERSION_CONFLICT`; nunca descarta edição silenciosamente.
4. `client_timestamp` não existe no push v2 e não participa da decisão.
5. Cada mutação possui `operation_id`; deduplicação durável usa `(tenant_id, device_id, operation_id)`.
6. Advisory lock transacional serializa somente retries da mesma operação, inclusive com múltiplas instâncias do backend.
7. Resultado por item possui estado e `retryable` explícitos. Cliente nunca interpreta texto de erro.
8. Push v1 permanece disponível durante futura migração mobile.

## Contrato

`POST /api/sync/v2`

```json
{
  "device_id": "uuid-estável-da-instalação",
  "sync_run_id": "uuid-opcional-da-execução",
  "items": [{
    "operation_id": "uuid-estável-da-mutação",
    "uuid": "uuid-do-registro",
    "entity": "clientes",
    "operation": "UPDATE",
    "base_version": 3,
    "payload": { "razao_social": "Exemplo" }
  }]
}
```

Estados terminais: `applied`, `duplicate`, `conflict`, `rejected`. Estado repetível: `retryable`.

Códigos iniciais: `APPLIED`, `ALREADY_EXISTS`, `VERSION_CONFLICT`, `NOT_FOUND`, `VALIDATION_FAILED`, `TEMPORARY_FAILURE`.

CREATE não exige `base_version`. UPDATE e DELETE exigem. Bigint do pull continua trafegando como string; `version` atual usa inteiro positivo.

## Garantias

- Retry da mesma operação devolve resultado terminal original.
- Operações distintas concorrentes na mesma versão: no máximo uma aplica.
- Clock skew do dispositivo não altera vencedor.
- Falha transitória não entra na inbox e pode ser repetida.
- Falha permanente conhecida é terminal e pode ir para dead-letter.

## Retenção e operação

`sync_mutation_inbox` precisa ser retida por período maior que janela máxima de retry mobile. Política de limpeza e métricas serão definidas antes de produção. Migration local não implica rollout.

## Trabalho mobile futuro — não executar neste escopo

- Gerar/persistir `device_id`, `sync_run_id`, `operation_id` e `base_version`.
- Mutex promise in-flight dentro do `SyncService`; NetInfo com debounce/coalescing.
- Dead-letter persistente, máximo de tentativas e backoff exponencial com jitter.
- Aplicar página + cursor + versões na mesma transação SQLite.
- UX explícita para `VERSION_CONFLICT`.
- Remover dependência de `client_timestamp` após migração.

## Rollout futuro

Aplicar migration, publicar backend compatível, habilitar cliente por feature flag, medir adoção, definir retenção e só então retirar v1. Nenhuma dessas ações externas faz parte da alteração local.

## Decisões incorporadas em 2026-07-31 (PROB-0065 / FIX-0027)

**Transição de status não faz parte do contrato de sync.** `status` de pedido é
`serverControlledFields` na `SyncEntityPolicy`: o push o recusa em qualquer
origem e em qualquer operação. Transição tem endpoint próprio, permissão própria
(`pedidos.liberar`) e máquina de estados; `parcialmente_faturado`/`faturado` só
nascem do `FaturamentoService`. Quem faz push está online por definição — não há
caso de uso offline que justifique liberar pedido pela fila. Se um dia houver,
entra como **operação** de sync com permissão própria, nunca como campo de
UPDATE.

**Derivado não é entrada.** `total_sem_imposto`, `total_com_imposto` no
cabeçalho e `total_item` + os quatro campos de leitura no item são
`derivedFields` — categoria distinta de `serverControlledFields`, com mensagem
própria que lista os insumos a enviar. `ipi_perc` **é** insumo e foi adicionado à
allowlist do item: sem ele todo item vindo do sync nasceria com IPI zero.

**Pedido tem uma porta de escrita só.** `pedidos` e `itens_pedido` declaram
`writer: 'orders'` na policy e passam por `sync/writers/orders-sync.writer.ts` →
`orders/order-write.ts`, o mesmo núcleo da REST. As demais entidades seguem no
caminho genérico de SQL montado a partir da allowlist, que está correto para
cadastro simples. A invariante é fixada em `sync-write-boundary.spec.ts`.

**O v1 está congelado, não obsoleto.** É o protocolo que o cliente em árvore
usa, então foi endurecido com as mesmas guardas do v2 — inclusive o bump de
`version` no UPDATE, que era bug: sem ele a escrita de sync ficava invisível para
a concorrência otimista da web. Fora isso, nada novo entra no v1: nem entidade,
nem campo, nem semântica. A remoção continua condicionada ao rollout do v2 no
cliente.
