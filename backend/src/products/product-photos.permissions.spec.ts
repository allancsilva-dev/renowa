import { ProductPhotosController } from './product-photos.controller';
import {
  REQUIRED_PERMISSION_KEY,
  REQUIRED_PERMISSION_MODE_KEY,
} from '../common/decorators/require-permission.decorator';

/**
 * Invariante das permissões da foto do produto.
 *
 * O upload é o único endpoint de catálogo que aceita DUAS permissões
 * alternativas: definir a foto é parte de criar o produto e parte de editá-lo.
 * Um perfil com `produtos.criar` sem `produtos.editar` cadastrava o produto e
 * tomava 403 ao anexar a foto no mesmo fluxo — e a tela escondia o campo para
 * não expor esse 403.
 *
 * Os outros três continuam AND puro: ler é `produtos.ver`, e APAGAR a foto de um
 * produto que já existe é edição, não criação. Rebaixar o DELETE deixaria quem
 * só cadastra apagar a foto de qualquer produto do catálogo.
 *
 * O teste olha a metadata porque é ela que o `PermissionGuard` lê em runtime.
 */
const permissoes = (handler: unknown) =>
  Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler as object);
const modo = (handler: unknown) =>
  Reflect.getMetadata(REQUIRED_PERMISSION_MODE_KEY, handler as object);

describe('permissões da foto do produto', () => {
  it('PUT aceita produtos.criar OU produtos.editar', () => {
    expect(permissoes(ProductPhotosController.prototype.upsert))
      .toEqual(['produtos.criar', 'produtos.editar']);
    expect(modo(ProductPhotosController.prototype.upsert)).toBe('any');
  });

  it('DELETE continua exigindo produtos.editar, sem alternativa', () => {
    expect(permissoes(ProductPhotosController.prototype.remove)).toBe('produtos.editar');
    expect(modo(ProductPhotosController.prototype.remove)).toBeUndefined();
  });

  it.each([
    ['metadados', ProductPhotosController.prototype.find],
    ['conteúdo', ProductPhotosController.prototype.content],
  ])('GET de %s exige produtos.ver', (_nome, handler) => {
    expect(permissoes(handler)).toBe('produtos.ver');
    expect(modo(handler)).toBeUndefined();
  });
});
