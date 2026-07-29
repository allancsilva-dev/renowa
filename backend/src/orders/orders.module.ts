import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderPhoto } from './entities/order-photo.entity';
import { NotaFiscal } from '../faturamento/entities/nota-fiscal.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderPhotosService } from './order-photos.service';
import { OrderPhotosController } from './order-photos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, OrderPhoto, NotaFiscal])],
  controllers: [OrdersController, OrderPhotosController],
  providers: [OrdersService, OrderPhotosService],
  exports: [OrdersService],
})
export class OrdersModule {}
