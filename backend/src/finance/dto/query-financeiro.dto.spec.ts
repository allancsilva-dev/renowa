import 'reflect-metadata';
import { validate } from 'class-validator';
import {
  ComissoesQueryDto, FaturadosQueryDto, ParceirosQueryDto,
  ResumoComissoesQueryDto, VendasPorEmpresaQueryDto,
} from './query-financeiro.dto';

const queryTypes = [
  FaturadosQueryDto, ComissoesQueryDto, ParceirosQueryDto,
  ResumoComissoesQueryDto, VendasPorEmpresaQueryDto,
];

describe.each(queryTypes)('%p — intervalo de datas', (QueryType) => {
  it.each(['2026-02-31', '01/02/2026', '2026-01-01T00:00:00Z'])('recusa data inválida ou fora de YYYY-MM-DD: %s', async (data_inicio) => {
    const dto = Object.assign(new QueryType(), { data_inicio, data_fim: '2026-02-01' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('aceita datas válidas em YYYY-MM-DD', async () => {
    const dto = Object.assign(new QueryType(), { data_inicio: '2026-01-01', data_fim: '2026-02-01' });
    expect(await validate(dto)).toHaveLength(0);
  });
});
