import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { NotaFiscal } from '../faturamento/entities/nota-fiscal.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderItemPhotosService } from './order-item-photos.service';
import { OrderItemPhotosController } from './order-item-photos.controller';
import { ProductsModule } from '../products/products.module';
import { OrderItemPhoto } from './entities/order-item-photo.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, OrderItemPhoto, NotaFiscal]), ProductsModule],
  controllers: [OrdersController, OrderItemPhotosController],
  providers: [OrdersService, OrderItemPhotosService],
  exports: [OrdersService],
})
export class OrdersModule {}
