import 'reflect-metadata';
import { SyncEntity, SyncOperation } from './dto/sync.dto';
import { SYNC_ENTITY_POLICIES } from './sync-entity-policy';
import { SyncAuthorizationService } from './sync-authorization.service';
import { SyncController } from './sync.controller';
import { REQUIRED_PERMISSION_KEY } from '../common/decorators/require-permission.decorator';

describe('sync entity authorization policy', () => {
  it('defines non-empty permissions for every entity and operation', () => {
    const service = new SyncAuthorizationService({} as never);
    for (const entity of Object.values(SyncEntity)) {
      expect(SYNC_ENTITY_POLICIES[entity].permissions.pull).toMatch(/\.ver$/);
      for (const operation of Object.values(SyncOperation)) {
        expect(service.permissionFor(entity, operation)).toEqual(expect.any(String));
        expect(service.permissionFor(entity, operation)).not.toHaveLength(0);
      }
    }
  });

  it.each([
    ['pullClientes', SyncEntity.CLIENTES],
    ['pullClientesV2', SyncEntity.CLIENTES],
    ['pullPedidos', SyncEntity.PEDIDOS],
    ['pullPedidosV2', SyncEntity.PEDIDOS],
    ['pullProdutos', SyncEntity.PRODUTOS],
    ['pullProdutosV2', SyncEntity.PRODUTOS],
    ['pullFornecedores', SyncEntity.FORNECEDORES],
    ['pullFornecedoresV2', SyncEntity.FORNECEDORES],
    ['pullTransportadoras', SyncEntity.TRANSPORTADORAS],
    ['pullTransportadorasV2', SyncEntity.TRANSPORTADORAS],
    ['pullItensPedido', SyncEntity.ITENS_PEDIDO],
    ['pullItensPedidoV2', SyncEntity.ITENS_PEDIDO],
  ])('%s declares the policy pull permission', (method, entity) => {
    const handler = SyncController.prototype[method as keyof SyncController];
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler))
      .toBe(SYNC_ENTITY_POLICIES[entity].permissions.pull);
  });
});
