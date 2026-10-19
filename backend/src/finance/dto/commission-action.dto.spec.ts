import 'reflect-metadata';
import { validate } from 'class-validator';
import { RegistrarPagamentoDto } from './commission-action.dto';

describe('RegistrarPagamentoDto', () => {
  it.each(['2026-02-30', '20/07/2026', '2026-07-20T00:00:00Z', '2026-7-2'])('recusa data inválida ou fora de YYYY-MM-DD: %s', async (data_pagamento) => {
    const dto = Object.assign(new RegistrarPagamentoDto(), { data_pagamento, version: 1 });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('aceita data válida em YYYY-MM-DD', async () => {
    const dto = Object.assign(new RegistrarPagamentoDto(), { data_pagamento: '2026-07-20', version: 1 });
    expect(await validate(dto)).toHaveLength(0);
  });
});
