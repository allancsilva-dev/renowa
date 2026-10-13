import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Preposto } from './entities/preposto.entity';
import { PrepostoComissao } from './entities/preposto-comissao.entity';
import { PrepostoVendasService } from './preposto-vendas.service';
import { PrepostosController } from './prepostos.controller';
import { PrepostosService } from './prepostos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Preposto, PrepostoComissao])],
  controllers: [PrepostosController],
  providers: [PrepostosService, PrepostoVendasService],
  exports: [PrepostosService],
})
export class PrepostosModule {}
