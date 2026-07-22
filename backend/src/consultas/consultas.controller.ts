import { Controller, Get, Param } from '@nestjs/common';
import { CnpjLookupService } from './cnpj-lookup.service';

/**
 * Consulta de apoio ao preenchimento de formulário (cliente/fornecedor).
 * Sem @RequirePermission — decisão confirmada: exige só autenticação
 * (JwtAuthGuard global), não é uma operação sobre dado de tenant.
 */
@Controller('consultas')
export class ConsultasController {
  constructor(private readonly cnpjLookupService: CnpjLookupService) {}

  @Get('cnpj/:cnpj')
  async lookupCnpj(@Param('cnpj') cnpj: string) {
    return this.cnpjLookupService.lookup(cnpj);
  }
}
