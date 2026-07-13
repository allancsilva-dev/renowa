import { NotFoundException } from '@nestjs/common';
import { FinanceService } from './finance.service';

describe('FinanceService tenant supplier validation', () => {
  const movementRepo = {} as any;
  const commissionRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  } as any;
  const delinquencyRepo = {} as any;
  const partnerRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  } as any;
  const dataSource = { query: jest.fn() } as any;
  const service = new FinanceService(
    movementRepo,
    commissionRepo,
    delinquencyRepo,
    partnerRepo,
    dataSource,
  );

  beforeEach(() => jest.clearAllMocks());

  it('persists a commission only when supplier belongs to tenant', async () => {
    dataSource.query.mockResolvedValueOnce([{ id: 42 }]);

    const result = await service.createComissao({
      uuid: '73a301b7-66f2-49b6-9130-783d5de2497e',
      fornecedor_id: 42,
      valor_comissao: '10.00',
    }, 'tenant-a');

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      [42, 'tenant-a'],
    );
    expect(result.fornecedor_id).toBe(42);
  });

  it('rejects a supplier from another tenant', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(service.createComissao({
      uuid: '73a301b7-66f2-49b6-9130-783d5de2497e',
      fornecedor_id: 42,
      valor_comissao: '10.00',
    }, 'tenant-b')).rejects.toBeInstanceOf(NotFoundException);

    expect(commissionRepo.save).not.toHaveBeenCalled();
  });

  it('allows an omitted optional supplier without querying suppliers', async () => {
    const result = await service.createParceiro({
      uuid: '73a301b7-66f2-49b6-9130-783d5de2497e',
      nome_parceiro: 'Parceiro',
      data_pedido: '2026-07-12',
      valor_comissao: '10.00',
    }, 'tenant-a');

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(result.fornecedor_id).toBeNull();
  });
});
