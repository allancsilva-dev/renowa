import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { isValidCnpj } from '../common/validators/brazilian-document.validators';
import { CnpjLookupResponseDto } from './dto/cnpj-lookup-response.dto';

const BRASIL_API_TIMEOUT_MS = 5_000;

/** Shape parcial da resposta da BrasilAPI (só os campos que usamos). */
interface BrasilApiCnpjResponse {
  razao_social?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  ddd_telefone_1?: string | null;
}

@Injectable()
export class CnpjLookupService {
  /**
   * Consulta apoio de preenchimento — sem persistência, sem dado sensível de
   * tenant. Normaliza o CNPJ recebido, valida dígito verificador e consulta
   * a BrasilAPI com timeout curto (a rota não pode travar o formulário).
   */
  async lookup(rawCnpj: string): Promise<CnpjLookupResponseDto> {
    const cnpj = (rawCnpj ?? '').replace(/\D/g, '');
    if (!isValidCnpj(cnpj)) {
      throw new BadRequestException('CNPJ inválido.');
    }

    const response = await this.fetchWithTimeout(cnpj);

    if (response.status === 404) {
      throw new NotFoundException('CNPJ não encontrado.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('Consulta de CNPJ indisponível no momento.');
    }

    const body = (await response.json()) as BrasilApiCnpjResponse;
    return this.mapResponse(body);
  }

  private async fetchWithTimeout(cnpj: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BRASIL_API_TIMEOUT_MS);
    try {
      return await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: controller.signal });
    } catch {
      throw new ServiceUnavailableException('Consulta de CNPJ indisponível no momento.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private mapResponse(body: BrasilApiCnpjResponse): CnpjLookupResponseDto {
    return {
      razao_social: body.razao_social ?? null,
      endereco: body.logradouro ?? null,
      numero: body.numero ?? null,
      complemento: body.complemento ?? null,
      bairro: body.bairro ?? null,
      cidade: body.municipio ?? null,
      uf: body.uf ?? null,
      cep: body.cep ?? null,
      telefone: body.ddd_telefone_1 ?? null,
      // BrasilAPI não retorna inscrição estadual (dado estadual, não federal).
      inscricao_estadual: null,
    };
  }
}
