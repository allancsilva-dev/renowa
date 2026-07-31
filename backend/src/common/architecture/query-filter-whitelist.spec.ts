import 'reflect-metadata';
import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { Controller, Get, Query } from '@nestjs/common';
import { getMetadataStorage } from 'class-validator';
import { PaginationDto } from '../dto/pagination.dto';

/**
 * PROB-0081: misturar `@Query() dto` com `@Query('campo')` na mesma rota derruba
 * a requisição com 400.
 *
 * O `@Query()` sem chave faz o ValidationPipe global validar o objeto de query
 * INTEIRO contra aquele DTO, e com `whitelist` + `forbidNonWhitelisted`
 * (`main.ts`) qualquer parâmetro ausente do DTO devolve
 * `property <campo> should not exist` — inclusive os que a própria rota declara
 * em `@Query('campo')`. Foi assim que `GET /pedidos?origem=externo` e
 * `GET /sac?status=aberto` passaram a responder 400: `status`/`origem` chegavam
 * por chave solta enquanto a paginação chegava por `PaginationDto`.
 *
 * Pior que o 400: a validação de enum que os services fazem ficou inalcançável
 * por HTTP, e os testes de "enum inválido → 400" passaram pelo motivo errado.
 *
 * Regra: numa rota que já tem `@Query()` sem chave, todo `@Query('campo')` tem de
 * ser campo VALIDADO do DTO daquele `@Query()`. Rota que usa só `@Query('campo')`
 * está fora da regra — ali não há validação de objeto inteiro para colidir.
 *
 * `@Query('search')` junto de `@Query() PaginationDto` fica de fora porque
 * `search` É campo do DTO: a leitura é redundante, não quebrada. É exatamente
 * essa diferença que explica por que `search` funcionava e `origem` não.
 */

type RouteArgEntry = { index: number; data?: unknown };

/** Propriedades com pelo menos um decorator de validação, incluindo herdadas. */
function propriedadesValidadas(dto: unknown): Set<string> {
  if (typeof dto !== 'function') return new Set();
  const nome = (dto as { name: string }).name;
  return new Set(
    getMetadataStorage()
      .getTargetValidationMetadatas(dto as never, nome, true, false)
      .map((metadata) => metadata.propertyName),
  );
}

function listarControllers(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const caminho = join(dir, entry);
    if (statSync(caminho).isDirectory()) return listarControllers(caminho);
    return caminho.endsWith('.controller.ts') ? [caminho] : [];
  });
}

function violacoesDoModulo(modulo: Record<string, unknown>): string[] {
  const violacoes: string[] = [];

  {
    for (const exportado of Object.values(modulo)) {
      if (typeof exportado !== 'function') continue;
      const prototipo = (exportado as { prototype?: object }).prototype;
      if (!prototipo) continue;

      for (const metodo of Object.getOwnPropertyNames(prototipo)) {
        if (metodo === 'constructor') continue;

        // O Nest chaveia ROUTE_ARGS_METADATA pelo nome do método, no construtor.
        const argsDoMetodo = Reflect.getMetadata(ROUTE_ARGS_METADATA, exportado, metodo) as
          | Record<string, RouteArgEntry>
          | undefined;
        if (!argsDoMetodo) continue;

        const queries = Object.entries(argsDoMetodo)
          .filter(([chave]) => Number(chave.split(':')[0]) === RouteParamtypes.QUERY)
          .map(([, entrada]) => entrada);
        const comChave = queries.filter((entrada) => entrada.data !== undefined);
        const semChave = queries.find((entrada) => entrada.data === undefined);
        if (!semChave || !comChave.length) continue;

        const tipos = Reflect.getMetadata('design:paramtypes', prototipo, metodo) as unknown[] | undefined;
        const dto = tipos?.[semChave.index];
        const declaradas = propriedadesValidadas(dto);
        const ausentes = comChave
          .map((entrada) => String(entrada.data))
          .filter((campo) => !declaradas.has(campo));

        if (ausentes.length) {
          violacoes.push(
            `${(exportado as { name: string }).name}.${metodo}() — @Query('${ausentes.join("'), @Query('")}') `
              + `não é campo de ${(dto as { name?: string })?.name ?? 'DTO desconhecido'}: `
              + 'o forbidNonWhitelisted devolve 400 antes do handler. '
              + 'Declare o filtro no DTO (ex.: `class ListXQueryDto extends PaginationDto`).',
          );
        }
      }
    }
  }

  return violacoes;
}

describe('Arquitetura: @Query() sem chave não convive com @Query(\'campo\') (PROB-0081)', () => {
  const arquivos = listarControllers(resolve(__dirname, '../..'));

  it('encontra os controllers do projeto', () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  // Sem este caso o teste acima poderia estar cego e ninguém saberia — foi
  // exatamente assim que os testes de "enum inválido → 400" do roteiro passaram
  // enquanto a validação de enum era inalcançável.
  it('detecta o defeito num controller que o tenha', () => {
    class ListaSemFiltroDto extends PaginationDto {}

    @Controller('fake')
    class FakeController {
      @Get()
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      findAll(@Query() _query: ListaSemFiltroDto, @Query('origem') _origem: string) {
        return null;
      }
    }

    expect(violacoesDoModulo({ FakeController })).toEqual([
      expect.stringContaining("FakeController.findAll() — @Query('origem') não é campo de ListaSemFiltroDto"),
    ]);
  });

  it.each(arquivos)('%s não mistura @Query() com @Query(\'campo\')', (arquivo) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expect(violacoesDoModulo(require(arquivo))).toEqual([]);
  });
});
