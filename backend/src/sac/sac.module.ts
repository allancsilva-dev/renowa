import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SacTicket } from './entities/sac-ticket.entity';
import { SacTicketItem } from './entities/sac-ticket-item.entity';
import { SacService } from './sac.service';
import { SacController } from './sac.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SacTicket, SacTicketItem])],
  controllers: [SacController],
  providers: [SacService],
  exports: [SacService],
})
export class SacModule {}
