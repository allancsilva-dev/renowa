import { ForbiddenException } from '@nestjs/common';
import { FaturamentoController } from './faturamento.controller';
import { RequestUser } from '../common/types/jwt-payload.type';

const pedidoUuid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const dto = { valor: 50, motivo: 'Desconto negociado', version: 1 };

function user(roles: string[]): RequestUser {
  return { sub: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId: 'tenant-a', roles } as RequestUser;
}

describe('FaturamentoController — ajuste de valor', () => {
  it('só ADMIN ajusta: Gestão e Financeiro recebem 403 mesmo com faturamento.editar', async () => {
    const service = { ajustarValor: jest.fn() };
    const controller = new FaturamentoController(service as any);

    for (const roles of [['GESTAO'], ['FINANCEIRO'], ['VENDEDOR']]) {
      await expect(controller.ajustarValor(pedidoUuid, dto, user(roles))).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(service.ajustarValor).not.toHaveBeenCalled();
  });

  it('ADMIN ajusta, com autor vindo do token e não do corpo', async () => {
    const service = { ajustarValor: jest.fn().mockResolvedValue({ uuid: pedidoUuid }) };
    const controller = new FaturamentoController(service as any);

    await controller.ajustarValor(pedidoUuid, dto, user(['GESTAO', 'ADMIN']));

    expect(service.ajustarValor).toHaveBeenCalledWith(pedidoUuid, dto, 'tenant-a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });
});
