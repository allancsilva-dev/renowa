import { BadRequestException } from '@nestjs/common';
import { FinanceController } from './finance.controller';

describe('FinanceController — filtro de faturados', () => {
  const financeService = {
    findFaturados: jest.fn(),
    findAllComissoes: jest.fn(),
    getResumoComissoes: jest.fn(),
    getVendasPorEmpresa: jest.fn(),
    findAllParceiros: jest.fn(),
  };
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

  it.each([
    ['comissões', () => controller.findAllComissoes({ data_inicio: '2026-01-01' }, user)],
    ['resumo', () => controller.resumoComissoes({ data_inicio: '2026-01-01' }, user)],
    ['empresas', () => controller.vendasPorEmpresa({ data_inicio: '2026-01-01' }, user)],
    ['parceiros', () => controller.findAllParceiros({ data_inicio: '2026-01-01' }, user)],
  ])('exige ambas as datas em %s', async (_nome, executar) => {
    await expect(executar()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('encaminha intervalo para listagem, resumo, empresas e parceiros', async () => {
    const query = { data_inicio: '2026-01-01', data_fim: '2026-02-01' };

    await controller.findAllComissoes(query, user);
    await controller.resumoComissoes(query, user);
    await controller.vendasPorEmpresa(query, user);
    await controller.findAllParceiros(query, user);

    expect(financeService.findAllComissoes).toHaveBeenCalledWith('tenant-a', query, expect.objectContaining(query));
    expect(financeService.getResumoComissoes).toHaveBeenCalledWith('tenant-a', expect.objectContaining(query));
    expect(financeService.getVendasPorEmpresa).toHaveBeenCalledWith('tenant-a', expect.objectContaining(query));
    expect(financeService.findAllParceiros).toHaveBeenCalledWith('tenant-a', query, expect.objectContaining(query));
  });
});
