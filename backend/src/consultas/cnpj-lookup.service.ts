import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { isValidCnpj } from '../common/validators/brazilian-document.validators';
import { CnpjLookupResponseDto } from './dto/cnpj-lookup-response.dto';

const PROVIDER_TIMEOUT_MS = 5_000;
const PROVIDERS = [
  { name: 'BrasilAPI', url: (cnpj: string) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}` },
  { name: 'Minha Receita', url: (cnpj: string) => `https://minhareceita.org/${cnpj}` },
] as const;

// A BrasilAPI fica atrás do WAF da Vercel, que responde 403 a requisição sem
// `User-Agent`. O `fetch` global do Node (undici) não manda um por padrão — por
// isso a mesma URL devolve 200 no curl e 403 na aplicação, e a consulta nunca
// funcionou até esta correção. Não remover estes headers.
const CNPJ_API_HEADERS = {
  'User-Agent': 'Renowa/1.0 (+https://renowa.nexostech.com.br)',
  Accept: 'application/json',
} as const;

/** Campos compartilhados pelas respostas da BrasilAPI e Minha Receita. */
interface CnpjProviderResponse {
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
   * a BrasilAPI; em falha técnica, consulta a Minha Receita. Cada provedor
   * tem timeout curto para a rota não travar o formulário.
   */
  async lookup(rawCnpj: string): Promise<CnpjLookupResponseDto> {
    const cnpj = (rawCnpj ?? '').replace(/\D/g, '');
    if (!isValidCnpj(cnpj)) {
      throw new BadRequestException('CNPJ inválido.');
    }

    for (const provider of PROVIDERS) {
      try {
        const result = await this.fetchWithTimeout(provider.url(cnpj));
        if (result.status === 404) {
          throw new NotFoundException('CNPJ não encontrado.');
        }
        if (!result.ok) {
          this.logger.warn(`${provider.name} respondeu ${result.status} na consulta de CNPJ.`);
          continue;
        }

        const body = result.body;
        if (!body || typeof body.razao_social !== 'string' || !body.razao_social.trim()) {
          this.logger.warn(`${provider.name} retornou dados inválidos na consulta de CNPJ.`);
          continue;
        }
        return this.mapResponse(body);
      } catch (error) {
        if (error instanceof NotFoundException) throw error;
        const aborted = (error as Error)?.name === 'AbortError';
        this.logger.warn(
          aborted
            ? `${provider.name} excedeu timeout (${PROVIDER_TIMEOUT_MS}ms) na consulta de CNPJ.`
            : `${provider.name} falhou na consulta de CNPJ: ${(error as Error)?.name ?? 'erro desconhecido'}.`,
        );
      }
    }
    throw new ServiceUnavailableException('Consulta de CNPJ indisponível no momento.');
  }

  private async fetchWithTimeout(url: string): Promise<{ status: number; ok: boolean; body?: CnpjProviderResponse }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: CNPJ_API_HEADERS,
      });
      return {
        status: response.status,
        ok: response.ok,
        body: response.ok ? (await response.json()) as CnpjProviderResponse : undefined,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private mapResponse(body: CnpjProviderResponse): CnpjLookupResponseDto {
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
