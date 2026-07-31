import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductPhoto } from './entities/product-photo.entity';
import { ProductsService } from './products.service';
import { ProductPhotosService } from './product-photos.service';
import { ProductsController } from './products.controller';
import { ProductPhotosController } from './product-photos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductPhoto])],
  controllers: [ProductsController, ProductPhotosController],
  providers: [ProductsService, ProductPhotosService],
  exports: [ProductsService, ProductPhotosService],
})
export class ProductsModule {}
