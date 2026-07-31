/**
 * Fake de `SelectQueryBuilder`/`UpdateQueryBuilder` para os specs de service.
 *
 * Existe porque o fake feito à mão em cada spec sempre nasce com o mesmo furo:
 * um único objeto devolvido para TODAS as queries, com `execute` fixo em
 * `{ affected: 1 }`. Com isso, `expect(builder.andWhere).toHaveBeenCalledWith(...)`
 * prova apenas que ALGUMA query do teste usou aquele predicado, e o caminho de
 * falha da escrita condicional (`affected: 0` → 409) fica inalcançável — o teste
 * passa com o código quebrado.
 *
 * Aqui cada `createQueryBuilder()` devolve um builder NOVO, registrado em ordem
 * e por alias, e as respostas terminais são configuráveis por alias. O molde é o
 * de `optimistic-concurrency.spec.ts`, que já acertava isso sozinho.
 */

/** Métodos que ENCERRAM a cadeia. Todo o resto encadeia e devolve o builder. */
const TERMINAIS: Record<string, unknown> = {
  execute: { affected: 1, raw: [] },
  getOne: null,
  getRawOne: undefined,
  getMany: [],
  getRawMany: [],
  getManyAndCount: [[], 0],
  getCount: 0,
};

export type BuilderFake = Record<string, jest.Mock>;

/** Respostas terminais deste builder, por nome de método. */
export type RespostasDoBuilder = Partial<Record<keyof typeof TERMINAIS, unknown>>;

export interface FabricaDeBuilders {
  (alias?: string): BuilderFake;
  /** Builders criados, na ordem em que o código sob teste os pediu. */
  readonly criados: BuilderFake[];
  /** Só os criados com este alias (`undefined` = chamada sem alias). */
  porAlias(alias?: string): BuilderFake[];
  /** O único builder com este alias. Falha alto se houver zero ou vários. */
  unico(alias?: string): BuilderFake;
}

function builderFake(respostas: RespostasDoBuilder): BuilderFake {
  const metodos = new Map<string, jest.Mock>();

  const alvo = {} as BuilderFake;
  const builder: BuilderFake = new Proxy(alvo, {
    get(_alvo, propriedade) {
      // `await builder` e inspeção interna do Jest não podem receber um mock:
      // um `then` invocável faria o builder ser tratado como Promise.
      if (typeof propriedade !== 'string' || propriedade === 'then') return undefined;

      const existente = metodos.get(propriedade);
      if (existente) return existente;

      const ehTerminal = propriedade in TERMINAIS;
      const resposta = ehTerminal
        ? (propriedade in respostas ? respostas[propriedade] : TERMINAIS[propriedade])
        : undefined;

      const metodo = ehTerminal
        ? jest.fn().mockResolvedValue(resposta)
        : jest.fn(() => builder);
      metodos.set(propriedade, metodo);
      return metodo;
    },
  });

  return builder;
}

/**
 * Fábrica para plugar em `createQueryBuilder`.
 *
 * `porAlias` casa pelo alias que o código sob teste passa — `undefined` para as
 * chamadas sem alias (as de UPDATE). É assim que um mesmo repositório serve a
 * escrita condicional e a releitura de `version` com respostas diferentes, que é
 * o que o teste de 409 exige.
 */
export function fabricaDeBuilders(config: {
  padrao?: RespostasDoBuilder;
  porAlias?: Record<string, RespostasDoBuilder>;
} = {}): FabricaDeBuilders {
  const criados: Array<{ alias?: string; builder: BuilderFake }> = [];

  const fabrica = ((alias?: string) => {
    const respostas = (alias !== undefined && config.porAlias?.[alias]) || config.padrao || {};
    const builder = builderFake(respostas);
    criados.push({ alias, builder });
    return builder;
  }) as FabricaDeBuilders;

  Object.defineProperty(fabrica, 'criados', {
    get: () => criados.map((registro) => registro.builder),
  });

  fabrica.porAlias = (alias?: string) => criados
    .filter((registro) => registro.alias === alias)
    .map((registro) => registro.builder);

  fabrica.unico = (alias?: string) => {
    const encontrados = fabrica.porAlias(alias);
    if (encontrados.length !== 1) {
      throw new Error(
        `Esperado 1 builder com alias ${String(alias)}, encontrados ${encontrados.length}.`,
      );
    }
    return encontrados[0];
  };

  return fabrica;
}
