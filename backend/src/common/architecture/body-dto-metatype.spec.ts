import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';

/**
 * PROB-0064: `@Body() dto: Partial<CreateXDto>` desliga a validação sem avisar.
 *
 * `Partial<T>` é tipo TypeScript, não classe: o `design:paramtypes` emitido é
 * `Object`, e o `ValidationPipe` global — mesmo com `whitelist` +
 * `forbidNonWhitelisted` — PULA metatypes nativos. O body chega cru no
 * `Object.assign` do service, e `tenant_id`/`deleted_at`/`created_at` viram
 * graváveis: `PATCH {"tenant_id":"<uuid-vítima>"}` move o registro de tenant.
 *
 * O `grep` que encontrou os dois casos originais não impede o terceiro. Este
 * teste transforma a invariante em falha de CI: todo `@Body()` sem chave
 * precisa ter uma CLASSE como tipo (`UpdateXDto extends PartialType(...)`).
 *
 * `@Body('campo')` com chave está fora da regra de propósito — ali o Nest
 * extrai um campo só, e `String` é metatype legítimo.
 */

// Metatypes que o ValidationPipe ignora (ver `validation.pipe.ts#toValidate`).
const METATYPES_SEM_VALIDACAO = [String, Boolean, Number, Array, Object];

type RouteArgEntry = { index: number; data?: unknown };

function listarControllers(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const caminho = join(dir, entry);
    if (statSync(caminho).isDirectory()) return listarControllers(caminho);
    return caminho.endsWith('.controller.ts') ? [caminho] : [];
  });
}

describe('Arquitetura: @Body() sempre com classe DTO (PROB-0064)', () => {
  const arquivos = listarControllers(resolve(__dirname, '../..'));

  it('encontra os controllers do projeto', () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  it.each(arquivos)('%s não usa metatype nativo em @Body()', (arquivo) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const modulo = require(arquivo);
    const violacoes: string[] = [];

    for (const exportado of Object.values(modulo)) {
      if (typeof exportado !== 'function') continue;
      const prototipo = (exportado as { prototype?: object }).prototype;
      if (!prototipo) continue;

      // O Nest grava ROUTE_ARGS_METADATA no construtor MAS chaveado pelo nome
      // do método (`defineMetadata(key, value, target.constructor, methodName)`).
      // Ler só `getMetadata(key, Controller)` devolve vazio e faz este teste
      // passar sem verificar nada — foi assim que a 1ª versão dele nasceu cega.
      for (const metodo of Object.getOwnPropertyNames(prototipo)) {
        if (metodo === 'constructor') continue;

        const argsDoMetodo = Reflect.getMetadata(ROUTE_ARGS_METADATA, exportado, metodo) as
          | Record<string, RouteArgEntry>
          | undefined;
        if (!argsDoMetodo) continue;

        for (const [chave, entrada] of Object.entries(argsDoMetodo)) {
          const paramtype = Number(chave.split(':')[0]);
          if (paramtype !== RouteParamtypes.BODY) continue;
          // `@Body('campo')` extrai um campo só — fora da regra.
          if (entrada.data !== undefined) continue;

          const tipos = Reflect.getMetadata('design:paramtypes', prototipo, metodo) as
            | unknown[]
            | undefined;
          const tipo = tipos?.[entrada.index];

          if (!tipo || METATYPES_SEM_VALIDACAO.includes(tipo as never)) {
            violacoes.push(
              `${(exportado as { name: string }).name}.${metodo}() — @Body() tipado como ` +
                `${(tipo as { name?: string })?.name ?? 'desconhecido'}: ValidationPipe não valida. ` +
                'Use uma classe DTO (ex.: `class UpdateXDto extends PartialType(CreateXDto) {}`).',
            );
          }
        }
      }
    }

    expect(violacoes).toEqual([]);
  });
});
