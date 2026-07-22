import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { Order } from '../orders/entities/order.entity';
import { Commission } from '../finance/entities/commission.entity';
import { FaturamentoService } from './faturamento.service';
import { FaturamentoController } from './faturamento.controller';

/**
 * Registra Order/Commission diretamente (em vez de importar OrdersModule/
 * FinanceModule) para evitar dependência circular de módulo — o TypeORM
 * resolve as relações entre entidades pela metadata global do DataSource
 * (autoLoadEntities), não pelo grafo de imports do Nest. Repositórios
 * injetados via forFeature aqui são escopados só a este módulo.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NotaFiscal, Order, Commission])],
  controllers: [FaturamentoController],
  providers: [FaturamentoService],
  exports: [FaturamentoService],
})
export class FaturamentoModule {}
