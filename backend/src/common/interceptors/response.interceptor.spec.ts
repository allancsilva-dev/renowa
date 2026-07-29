import { StreamableFile } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

function run(value: unknown): Promise<unknown> {
  const interceptor = new ResponseInterceptor();
  return lastValueFrom(interceptor.intercept({} as never, { handle: () => of(value) }));
}

describe('ResponseInterceptor', () => {
  it('envolve objeto comum em { data }', async () => {
    await expect(run({ uuid: 'x' })).resolves.toEqual({ data: { uuid: 'x' } });
  });

  it('não re-envolve resposta paginada', async () => {
    const paginado = { data: [], meta: { total: 0 } };
    await expect(run(paginado)).resolves.toBe(paginado);
  });

  it('passa null/undefined (204) sem alteração', async () => {
    await expect(run(null)).resolves.toBeNull();
    await expect(run(undefined)).resolves.toBeUndefined();
  });

  /**
   * Sem esta exceção o binário sai como `{ data: {} }`: o Nest serializa o
   * envelope como JSON e a imagem chega corrompida. É o caminho da foto do
   * pedido (GET /pedidos/:uuid/fotos/:fotoUuid/conteudo).
   */
  it('passa StreamableFile intacto', async () => {
    const file = new StreamableFile(Buffer.from([0xff, 0xd8, 0xff]));
    await expect(run(file)).resolves.toBe(file);
  });
});
