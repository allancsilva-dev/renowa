import { BadRequestException } from '@nestjs/common';
import { FinanceController } from './finance.controller';

describe('FinanceController — filtro de faturados', () => {
  const financeService = { findFaturados: jest.fn() };
  const controller = new FinanceController(financeService as any);
  const user = { tenantId: 'tenant-a' } as any;

  beforeEach(() => jest.clearAllMocks());

  it('exige as duas datas do intervalo', async () => {
    await expect(controller.faturados({ data_inicio: '2026-01-01' }, user))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(financeService.findFaturados).not.toHaveBeenCalled();
  });

  it('recusa intervalo invertido', async () => {
    await expect(controller.faturados({ data_inicio: '2026-02-01', data_fim: '2026-01-01' }, user))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('mantém mês e ano por compatibilidade quando não há intervalo', async () => {
    financeService.findFaturados.mockResolvedValue({ data: [], meta: {} });
    await controller.faturados({ mes: '1', ano: '2026' }, user);
    expect(financeService.findFaturados).toHaveBeenCalledWith('tenant-a', expect.anything(), expect.objectContaining({ mes: 1, ano: 2026 }));
  });
});
