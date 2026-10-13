import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Preposto } from './entities/preposto.entity';
import { PrepostosController } from './prepostos.controller';
import { PrepostosService } from './prepostos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Preposto])],
  controllers: [PrepostosController],
  providers: [PrepostosService],
  exports: [PrepostosService],
})
export class PrepostosModule {}
