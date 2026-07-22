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
      expect.objectContaining({ signal: expect.anything() }),
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
});
