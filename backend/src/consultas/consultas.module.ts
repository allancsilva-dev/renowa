import { Module } from '@nestjs/common';
import { ConsultasController } from './consultas.controller';
import { CnpjLookupService } from './cnpj-lookup.service';

@Module({
  controllers: [ConsultasController],
  providers: [CnpjLookupService],
})
export class ConsultasModule {}
