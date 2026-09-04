import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { isValidCnpj } from '../common/validators/brazilian-document.validators';
import { CnpjLookupResponseDto } from './dto/cnpj-lookup-response.dto';

const BRASIL_API_TIMEOUT_MS = 5_000;

// A BrasilAPI fica atrás do WAF da Vercel, que responde 403 a requisição sem
// `User-Agent`. O `fetch` global do Node (undici) não manda um por padrão — por
// isso a mesma URL devolve 200 no curl e 403 na aplicação, e a consulta nunca
// funcionou até esta correção. Não remover estes headers.
const BRASIL_API_HEADERS = {
  'User-Agent': 'Renowa/1.0 (+https://renowa.nexostech.com.br)',
  Accept: 'application/json',
} as const;

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
  private readonly logger = new Logger(CnpjLookupService.name);

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
      // Log só o status (nunca o CNPJ nem o corpo da resposta de terceiro).
      // Sem isto, 403 de WAF e 5xx viram a mesma mensagem opaca no cliente e
      // não há como distinguir os dois em produção.
      this.logger.warn(`BrasilAPI respondeu ${response.status} na consulta de CNPJ.`);
      throw new ServiceUnavailableException('Consulta de CNPJ indisponível no momento.');
    }

    const body = (await response.json()) as BrasilApiCnpjResponse;
    return this.mapResponse(body);
  }

  private async fetchWithTimeout(cnpj: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BRASIL_API_TIMEOUT_MS);
    try {
      return await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        signal: controller.signal,
        headers: BRASIL_API_HEADERS,
      });
    } catch (error) {
      const aborted = (error as Error)?.name === 'AbortError';
      this.logger.warn(
        aborted
          ? `Consulta de CNPJ abortada por timeout (${BRASIL_API_TIMEOUT_MS}ms).`
          : `Falha de rede na consulta de CNPJ: ${(error as Error)?.name ?? 'erro desconhecido'}.`,
      );
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
