import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CnpjLookupService } from './cnpj-lookup.service';

const VALID_CNPJ = '11222333000181';

describe('CnpjLookupService', () => {
  let service: CnpjLookupService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new CnpjLookupService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('rejeita CNPJ com dígito verificador inválido antes de chamar a API', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.lookup('00000000000000')).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('encontrado: mapeia os campos e força inscricao_estadual sempre null', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        razao_social: 'Empresa Teste LTDA',
        logradouro: 'Rua das Flores',
        numero: '100',
        complemento: 'Sala 1',
        bairro: 'Centro',
        municipio: 'São Paulo',
        uf: 'SP',
        cep: '01000-000',
        ddd_telefone_1: '1140028922',
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await service.lookup(`${VALID_CNPJ.slice(0, 2)}.${VALID_CNPJ.slice(2, 5)}.${VALID_CNPJ.slice(5, 8)}/${VALID_CNPJ.slice(8, 12)}-${VALID_CNPJ.slice(12)}`);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://brasilapi.com.br/api/cnpj/v1/${VALID_CNPJ}`,
      expect.objectContaining({
        signal: expect.anything(),
        // Sem `User-Agent` o WAF da Vercel responde 403 e a consulta não
        // funciona — foi assim que a feature foi entregue. Ver o teste
        // "envia User-Agent" abaixo.
        headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
      }),
    );
    expect(result).toEqual({
      razao_social: 'Empresa Teste LTDA',
      endereco: 'Rua das Flores',
      numero: '100',
      complemento: 'Sala 1',
      bairro: 'Centro',
      cidade: 'São Paulo',
      uf: 'SP',
      cep: '01000-000',
      telefone: '1140028922',
      inscricao_estadual: null,
    });
  });

  it('inexistente: 404 da BrasilAPI vira NotFoundException', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.lookup(VALID_CNPJ)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('erro de rede (timeout/abort) vira ServiceUnavailableException', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.lookup(VALID_CNPJ)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('5xx da BrasilAPI vira ServiceUnavailableException', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.lookup(VALID_CNPJ)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('403 do WAF vira ServiceUnavailableException (modo de falha real do bug)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.lookup(VALID_CNPJ)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('envia User-Agent não vazio — sem ele a BrasilAPI responde 403', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await service.lookup(VALID_CNPJ);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['User-Agent']).toEqual(expect.any(String));
    expect(headers['User-Agent'].length).toBeGreaterThan(0);
  });
});

/**
 * Integração real contra a BrasilAPI. Fora da suíte padrão de propósito (rede
 * na CI é flaky), mas é o único teste que pegaria a classe de bug que deixou
 * esta consulta quebrada em produção: com `fetch` mockado, o 403 do WAF por
 * falta de `User-Agent` é invisível.
 *
 *   CNPJ_LIVE_TEST=1 npx jest src/consultas
 */
const liveDescribe = process.env.CNPJ_LIVE_TEST === '1' ? describe : describe.skip;

liveDescribe('CnpjLookupService — integração real (opt-in)', () => {
  jest.setTimeout(15_000);

  it('consulta um CNPJ público real e devolve razão social', async () => {
    const result = await new CnpjLookupService().lookup('00000000000191');

    expect(result.razao_social).toEqual(expect.any(String));
    expect(result.razao_social!.length).toBeGreaterThan(0);
    expect(result.uf).toEqual(expect.any(String));
    expect(result.inscricao_estadual).toBeNull();
  });
});
