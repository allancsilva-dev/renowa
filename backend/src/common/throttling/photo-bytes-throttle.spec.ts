import { ProductPhotosController } from '../../products/product-photos.controller';
import { OrderItemPhotosController } from '../../orders/order-item-photos.controller';

/**
 * Invariante: todo endpoint que serve BYTES de imagem tem teto de rate limit
 * próprio e folgado.
 *
 * O teto global é de 100 req/min, e o `generateKey` do `@nestjs/throttler`
 * inclui classe e handler — então cada rota tem seu balde. Emitir o papel de um
 * pedido com mais de 100 produtos distintos estourava o balde DESSA rota, e o
 * cliente, que engolia o 429, imprimia o documento sem as fotos que faltaram.
 * O cliente agora aborta a emissão; este teto evita que ele precise.
 *
 * O teste olha a metadata porque a alternativa — subir a app e martelar a rota
 * até o 429 — mede o throttler do Nest, não a nossa configuração.
 */

// `@nestjs/throttler` não reexporta as constantes pelo index. Fonte:
// `dist/throttler.decorator.js` — `THROTTLER_LIMIT + nome do throttler`.
const CHAVE_DE_LIMITE = 'THROTTLER:LIMITdefault';
const CHAVE_DE_TTL = 'THROTTLER:TTLdefault';

const LIMITE_ESPERADO = 300;
const TTL_ESPERADO = 60_000;

describe('teto de rate limit dos endpoints de bytes', () => {
  it.each([
    ['GET /produtos/:uuid/foto/conteudo', ProductPhotosController.prototype.content],
    ['GET /pedidos/:uuid/itens/:itemUuid/foto', OrderItemPhotosController.prototype.content],
  ])('%s tem @Throttle próprio', (_rota, handler) => {
    expect(Reflect.getMetadata(CHAVE_DE_LIMITE, handler)).toBe(LIMITE_ESPERADO);
    expect(Reflect.getMetadata(CHAVE_DE_TTL, handler)).toBe(TTL_ESPERADO);
  });

  /** O upload continua caro e continua apertado — o teto folgado é só do GET. */
  it('não afrouxa o teto do upload', () => {
    expect(Reflect.getMetadata(CHAVE_DE_LIMITE, ProductPhotosController.prototype.upsert)).toBe(30);
  });
});
